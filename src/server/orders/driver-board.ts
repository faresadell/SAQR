import "server-only";
import type { DeliveryStatus, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";
import { setDeliveryStatus } from "@/server/orders/delivery";
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

/** First driver wins. Someone else already holding it is answered with that driver's name. */
export async function claimOrder(actor: Actor, orderId: string): Promise<ClaimResult> {
  return db.$transaction(async (tx): Promise<ClaimResult> => {
    const driver = await currentDriver(tx, actor);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { merchant: true } });
    if (!order) throw new NotFoundError();
    if (!BOARD_ORDER_STATUS.includes(order.orderStatus) || order.paymentStatus !== "CONFIRMED") {
      return order.deliveryStatus === "DRIVER_ASSIGNED" || order.deliveryStatus === "PICKED_UP" ? { ok: false, error: "TAKEN", takenBy: await holderName(tx, orderId) } : { ok: false, error: "NOT_AVAILABLE" };
    }
    if (!BOARD_DELIVERY_STATUS.includes(order.deliveryStatus)) {
      return order.deliveryStatus === "DRIVER_ASSIGNED" || order.deliveryStatus === "PICKED_UP" ? { ok: false, error: "TAKEN", takenBy: await holderName(tx, orderId) } : { ok: false, error: "NOT_AVAILABLE" };
    }
    // Atomic: only one driver can flip the order out of the board states.
    const won = await tx.order.updateMany({ where: { id: order.id, deliveryStatus: order.deliveryStatus, orderStatus: order.orderStatus }, data: { deliveryStatus: "DRIVER_ASSIGNED" } });
    if (won.count !== 1) {
      const name = await holderName(tx, orderId);
      return name ? { ok: false, error: "TAKEN", takenBy: name } : { ok: false, error: "NOT_AVAILABLE" };
    }
    const now = new Date();
    await tx.orderEvent.create({ data: { orderId, field: "deliveryStatus", fromValue: order.deliveryStatus, toValue: "DRIVER_ASSIGNED", actorId: actor.id, note: `driver ${driver.id} accepted from the board` } });
    await tx.deliveryRecord.upsert({
      where: { orderId },
      create: { orderId, driverId: driver.id, feeExpectedCents: order.deliveryFeeCents, assignedAt: now },
      update: { driverId: driver.id, assignedAt: now, pickedUpAt: null, deliveredAt: null },
    });
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } });
    await notifyInTx(tx, { userId: order.merchant.ownerId, type: "DELIVERY_ASSIGNED", title: "سائق قبل الطلب", body: `السائق ${me.name} قبل توصيل الطلب رقم ${order.number}.`, data: { orderId }, dedupeKey: `board-claimed-shop:${orderId}:${now.getTime()}` });
    await notifyInTx(tx, { userId: order.customerId, type: "DELIVERY_ASSIGNED", title: "سائق في طريقه لاستلام طلبك", body: `السائق ${me.name} قبل توصيل طلبك رقم ${order.number}.`, data: { orderId }, dedupeKey: `board-claimed-customer:${orderId}:${now.getTime()}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_CLAIMED", entityType: "Order", entityId: orderId, after: { driverId: driver.id } }, tx);
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
    await setDeliveryStatus(tx, order, "AWAITING_DRIVER", actor.id, "released by driver");
    await tx.deliveryRecord.update({ where: { id: record.id }, data: { driverId: null, assignedAt: null } });
    await notifyInTx(tx, { userId: order.merchant.ownerId, type: "DELIVERY_FAILED", title: "السائق تراجع عن الطلب", body: `السائق تراجع عن توصيل الطلب رقم ${order.number} وعاد الطلب لقائمة السائقين.`, data: { orderId }, dedupeKey: `board-released:${orderId}:${Date.now()}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_RELEASED", entityType: "Order", entityId: orderId }, tx);
    return { ok: true };
  });
}
