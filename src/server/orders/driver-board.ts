import "server-only";
import type { DeliveryStatus, Merchant, Order, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";
import { BUSY_DELIVERY_STATUSES, freshSince, touchDriver } from "@/server/drivers/service";
import { clearLocationIfIdle } from "@/server/drivers/location";
import { openTrip, setDeliveryStatus } from "@/server/orders/delivery";
import type { Tx } from "@/server/orders/lifecycle";

/** The open board: an order is on it once the shop accepted it and the payment is confirmed, until a driver takes it. */
const BOARD_ORDER_STATUS: OrderStatus[] = ["APPROVED", "PREPARING", "READY"];
const BOARD_DELIVERY_STATUS: DeliveryStatus[] = ["NOT_STARTED", "AWAITING_DRIVER"];
/** Technical cap so one driver cannot hoard the board (not a business rule): orders held and not yet delivered. */

export type ClaimResult = { ok: true } | { ok: false; error: "NOT_AVAILABLE" | "TAKEN"; takenBy?: string };
export type ReleaseResult = { ok: true } | { ok: false; error: "WRONG_STATE" };

async function currentDriver(tx: Tx, actor: Actor) {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { status: true } });
  if (!user || user.status !== "ACTIVE") throw new AuthorizationError();
  const driver = await tx.driver.upsert({ where: { userId: actor.id }, create: { userId: actor.id, merchantId: null }, update: {} });
  if (!driver.isActive) throw new AuthorizationError();
  return driver;
}

async function holderName(tx: Tx, orderId: string): Promise<string | undefined> {
  const record = await tx.deliveryRecord.findUnique({ where: { orderId }, include: { driver: { include: { user: { select: { name: true } } } } } });
  return record?.driver?.user.name;
}

/** What a driver may see before accepting: the shop and the area, the fee. NOT the customer's name, phone or exact address. */
export async function listBoard(actor: Actor) {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  await touchDriver(actor.id);
  const rows = await db.order.findMany({
    where: { orderStatus: { in: BOARD_ORDER_STATUS }, paymentStatus: "CONFIRMED", deliveryStatus: { in: BOARD_DELIVERY_STATUS } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, number: true, orderStatus: true, deliveryFeeCents: true, addressSnap: true, createdAt: true, merchant: { select: { name: true, address: true } } },
  });
  const zoneIds = [...new Set(rows.map((r) => (r.addressSnap as { zoneId?: string } | null)?.zoneId).filter((z): z is string => typeof z === "string"))];
  const zones = zoneIds.length ? await db.deliveryZone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, name: true } }) : [];
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  return rows.map((r) => ({
    orderId: r.id,
    number: r.number,
    shop: r.merchant.name,
    shopAddress: r.merchant.address,
    zone: zoneName.get((r.addressSnap as { zoneId?: string } | null)?.zoneId ?? "") ?? null,
    ready: r.orderStatus === "READY",
    feeCents: r.deliveryFeeCents,
    createdAt: r.createdAt,
  }));
}

type ClaimableOrder = Order & { merchant: Merchant };

/** Flip one order out of the board (atomic: only one driver can win) and give the driver its delivery record. */
async function takeOrder(tx: Tx, actor: Actor, driverId: string, order: ClaimableOrder, fee: { cents: number; status: "NONE" | "PROPOSED" | "APPROVED" }, driverName: string): Promise<boolean> {
  const won = await tx.order.updateMany({ where: { id: order.id, deliveryStatus: order.deliveryStatus, orderStatus: order.orderStatus }, data: { deliveryStatus: "DRIVER_ASSIGNED" } });
  if (won.count !== 1) return false;
  const now = new Date();
  await tx.orderEvent.create({ data: { orderId: order.id, field: "deliveryStatus", fromValue: order.deliveryStatus, toValue: "DRIVER_ASSIGNED", actorId: actor.id, note: `driver ${driverId} accepted from the board` } });
  await tx.deliveryRecord.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, driverId, feeExpectedCents: fee.cents, feeStatus: fee.status, assignedAt: now },
    update: { driverId, assignedAt: now, pickedUpAt: null, deliveredAt: null, feeStatus: fee.status, feeExpectedCents: fee.cents },
  });
  await notifyInTx(tx, { userId: order.merchant.ownerId, type: "DELIVERY_ASSIGNED", title: "سائق قبل الطلب", body: `السائق ${driverName} قبل توصيل الطلب رقم ${order.number}.`, data: { orderId: order.id }, dedupeKey: `board-claimed-shop:${order.id}:${now.getTime()}` });
  await notifyInTx(tx, { userId: order.customerId, type: "DELIVERY_ASSIGNED", title: "سائق في طريقه لاستلام طلبك", body: `السائق ${driverName} قبل توصيل طلبك رقم ${order.number}.`, data: { orderId: order.id }, dedupeKey: `board-claimed-customer:${order.id}:${now.getTime()}` });
  await writeAudit({ actorId: actor.id, action: "DELIVERY_CLAIMED", entityType: "Order", entityId: order.id, after: { driverId } }, tx);
  return true;
}

const onBoard = (o: { orderStatus: OrderStatus; paymentStatus: string; deliveryStatus: DeliveryStatus }) => BOARD_ORDER_STATUS.includes(o.orderStatus) && o.paymentStatus === "CONFIRMED" && BOARD_DELIVERY_STATUS.includes(o.deliveryStatus);

/**
 * First driver wins. Someone else already holding it is answered with that driver's name.
 * Taking one sub-order also takes the customer's other sub-orders that are ready on the board: one trip, one delivery price.
 */
export async function claimOrder(actor: Actor, orderId: string): Promise<ClaimResult> {
  return db.$transaction(async (tx): Promise<ClaimResult> => {
    const driver = await currentDriver(tx, actor);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { merchant: true } });
    if (!order) throw new NotFoundError();
    if (!onBoard(order)) return order.deliveryStatus === "DRIVER_ASSIGNED" || order.deliveryStatus === "PICKED_UP" ? { ok: false, error: "TAKEN", takenBy: await holderName(tx, orderId) } : { ok: false, error: "NOT_AVAILABLE" };
    const prior = await openTrip(tx, driver.id, orderId); // sub-orders of this customer order the driver already holds
    const siblings = order.parentOrderId
      ? (await tx.order.findMany({ where: { parentOrderId: order.parentOrderId, id: { not: order.id } }, include: { merchant: true }, orderBy: { number: "asc" } })).filter(onBoard)
      : [];
    const group = [order, ...siblings].sort((a, b) => a.number - b.number);
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } });
    let claimedTarget = false;
    for (const [index, o] of group.entries()) {
      // The first of the trip carries the whole price; later ones (and ones joining a trip already priced) carry 0 and follow its status.
      const joining = prior.length > 0;
      const fee = joining ? { cents: 0, status: prior[0]!.feeStatus } : { cents: index === 0 ? o.deliveryFeeCents : 0, status: "NONE" as const };
      const ok = await takeOrder(tx, actor, driver.id, o, fee, me.name);
      if (o.id === order.id) claimedTarget = ok;
    }
    if (!claimedTarget) {
      const name = await holderName(tx, orderId);
      return name ? { ok: false, error: "TAKEN", takenBy: name } : { ok: false, error: "NOT_AVAILABLE" };
    }
    return { ok: true };
  });
}

/** The driver changes their mind before picking up: the order goes back to the board and the shop is told. */
export async function releaseOrder(actor: Actor, orderId: string): Promise<ReleaseResult> {
  return db.$transaction(async (tx): Promise<ReleaseResult> => {
    const driver = await currentDriver(tx, actor);
    const record = await tx.deliveryRecord.findUnique({ where: { orderId } });
    if (!record || record.driverId !== driver.id) throw new NotFoundError();
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { merchant: true } });
    if (order.deliveryStatus !== "DRIVER_ASSIGNED") return { ok: false, error: "WRONG_STATE" };
    // The whole unpicked trip goes back together, because the delivery price was agreed for all of it.
    for (const r of await openTrip(tx, driver.id, orderId)) {
      await setDeliveryStatus(tx, r.order, "AWAITING_DRIVER", actor.id, "released by driver");
      await tx.deliveryRecord.update({ where: { id: r.id }, data: { driverId: null, assignedAt: null, feeStatus: "NONE", feeExpectedCents: r.order.deliveryFeeCents } });
      await notifyInTx(tx, { userId: r.order.merchant.ownerId, type: "DELIVERY_FAILED", title: "السائق تراجع عن الطلب", body: `السائق تراجع عن توصيل الطلب رقم ${r.order.number} وعاد الطلب لقائمة السائقين.`, data: { orderId: r.orderId }, dedupeKey: `board-released:${r.orderId}:${Date.now()}` });
      await clearLocationIfIdle(tx, driver.id);
      await writeAudit({ actorId: actor.id, action: "DELIVERY_RELEASED", entityType: "Order", entityId: r.orderId }, tx);
    }
    return { ok: true };
  });
}

/**
 * Tells the drivers who are available right now (switched on, seen recently, not on a trip) about orders that just reached the open
 * board, so nobody has to keep the board open. One notification per order and driver (retry-safe), recent orders only, a capped number
 * of drivers. Run from the scheduled job and opportunistically; it can be called as often as you like.
 */
export async function announceBoardOrders(): Promise<{ notified: number }> {
  const orders = await db.order.findMany({
    where: { orderStatus: { in: BOARD_ORDER_STATUS }, paymentStatus: "CONFIRMED", deliveryStatus: { in: BOARD_DELIVERY_STATUS }, createdAt: { gte: new Date(Date.now() - 6 * 3_600_000) } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, number: true, merchant: { select: { name: true } } },
  });
  if (orders.length === 0) return { notified: 0 };
  const drivers = await db.driver.findMany({
    where: { isActive: true, isOnline: true, lastSeenAt: { gte: freshSince() }, user: { status: "ACTIVE" }, deliveries: { none: { order: { deliveryStatus: { in: [...BUSY_DELIVERY_STATUSES] } } } } },
    select: { userId: true },
    take: 30,
  });
  if (drivers.length === 0) return { notified: 0 };
  const before = await db.notification.count({ where: { type: "DELIVERY_AVAILABLE", dedupeKey: { startsWith: "board:" } } });
  await db.$transaction((tx) =>
    notifyInTx(tx, ...orders.flatMap((o) => drivers.map((d) => ({ userId: d.userId, type: "DELIVERY_AVAILABLE", title: "طلب جديد متاح للتوصيل", body: `الطلب رقم ${o.number} من ${o.merchant.name} جاهز للسائقين. افتح «طلبات متاحة» وخده قبل غيرك.`, data: { orderId: o.id }, dedupeKey: `board:${o.id}:${d.userId}` })))),
  );
  return { notified: (await db.notification.count({ where: { type: "DELIVERY_AVAILABLE", dedupeKey: { startsWith: "board:" } } })) - before };
}
