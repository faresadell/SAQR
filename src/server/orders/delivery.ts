import "server-only";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";
import { fail, moveStatus, run, type LifecycleResult, type OrderRow, type Tx } from "@/server/orders/lifecycle";

/** Order stages in which a driver can be given the order (it is accepted, paid and not yet delivered). */
const ASSIGNABLE_ORDER = ["APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const;
/** Delivery stages from which (re)assignment is allowed: nothing is on the road, or the last attempt failed. */
const REASSIGNABLE: readonly DeliveryStatus[] = ["NOT_STARTED", "AWAITING_DRIVER", "DRIVER_ASSIGNED", "FAILED"];

async function setDeliveryStatus(tx: Tx, order: OrderRow, to: DeliveryStatus, actorId: string, note: string | null): Promise<void> {
  const changed = await tx.order.updateMany({ where: { id: order.id, deliveryStatus: order.deliveryStatus }, data: { deliveryStatus: to } });
  if (changed.count !== 1) fail("CONFLICT");
  await tx.orderEvent.create({ data: { orderId: order.id, field: "deliveryStatus", fromValue: order.deliveryStatus, toValue: to, actorId, note } });
}

/** The shop owner gives the order to one of ITS OWN active drivers. A driver of another shop is refused. */
export async function assignDriver(actor: Actor, orderId: string, driverId: string): Promise<LifecycleResult> {
  return run(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { merchant: true } });
    if (!order || actor.role !== "MERCHANT" || order.merchant.ownerId !== actor.id) throw new NotFoundError();
    if (!(ASSIGNABLE_ORDER as readonly string[]).includes(order.orderStatus) || order.paymentStatus !== "CONFIRMED") fail("WRONG_STATE");
    if (!REASSIGNABLE.includes(order.deliveryStatus)) fail("WRONG_STATE");
    const driver = await tx.driver.findUnique({ where: { id: driverId }, include: { user: true } });
    if (!driver || driver.merchantId !== order.merchantId || !driver.isActive || driver.user.status !== "ACTIVE") fail("DRIVER_NOT_AVAILABLE");
    const now = new Date();
    await tx.deliveryRecord.upsert({
      where: { orderId },
      create: { orderId, driverId, feeExpectedCents: order.deliveryFeeCents, assignedAt: now },
      update: { driverId: driver!.id, assignedAt: now, pickedUpAt: null, deliveredAt: null },
    });
    await setDeliveryStatus(tx, order, "DRIVER_ASSIGNED", actor.id, `driver ${driverId}`);
    await notifyInTx(tx, { userId: driver!.userId, type: "DELIVERY_ASSIGNED", title: "طلب توصيل جديد", body: `تم إسناد الطلب رقم ${order.number} إليك.`, data: { orderId }, dedupeKey: `delivery-assigned:${orderId}:${driverId}:${now.getTime()}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_ASSIGNED", entityType: "Order", entityId: orderId, after: { driverId } }, tx);
  });
}

async function loadMyDelivery(tx: Tx, actor: Actor, orderId: string) {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  const driver = await tx.driver.findUnique({ where: { userId: actor.id } });
  if (!driver || !driver.isActive) throw new AuthorizationError();
  const record = await tx.deliveryRecord.findUnique({ where: { orderId } });
  if (!record || record.driverId !== driver.id) throw new NotFoundError(); // another driver's order looks missing
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { merchant: true } });
  return { driver, record, order };
}

/** The driver collected the order from the shop. The order becomes OUT_FOR_DELIVERY (once). */
export async function pickUp(actor: Actor, orderId: string): Promise<LifecycleResult> {
  return run(async (tx) => {
    const { record, order } = await loadMyDelivery(tx, actor, orderId);
    if (order.deliveryStatus !== "DRIVER_ASSIGNED") fail("WRONG_STATE");
    if (order.orderStatus === "READY") await moveStatus(tx, order, "OUT_FOR_DELIVERY", actor.id, "picked up by driver");
    else if (order.orderStatus !== "OUT_FOR_DELIVERY") fail("WRONG_STATE"); // the shop has not finished preparing it
    await setDeliveryStatus(tx, order, "PICKED_UP", actor.id, null);
    await tx.deliveryRecord.update({ where: { id: record.id }, data: { pickedUpAt: new Date() } });
    await notifyInTx(tx, { userId: order.customerId, type: "ORDER_OUT_FOR_DELIVERY", title: "طلبك في الطريق", body: `خرج الطلب رقم ${order.number} للتوصيل.`, data: { orderId }, dedupeKey: `order-OUT_FOR_DELIVERY:${orderId}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_PICKED_UP", entityType: "Order", entityId: orderId }, tx);
  });
}

export interface DeliverInput {
  feeCollected: boolean;
  /** Required when the fee was not collected (what happened). */
  note?: string;
}

/** Delivered. The delivery fee is paid in cash to the driver: it is recorded as COLLECTED, or as an EXCEPTION with a note. */
export async function deliver(actor: Actor, orderId: string, input: DeliverInput): Promise<LifecycleResult> {
  const note = input.note?.trim() ?? "";
  if (typeof input.feeCollected !== "boolean" || note.length > 300 || (!input.feeCollected && note.length < 3)) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const { record, order } = await loadMyDelivery(tx, actor, orderId);
    if (order.deliveryStatus !== "PICKED_UP" || order.orderStatus !== "OUT_FOR_DELIVERY") fail("WRONG_STATE");
    const now = new Date();
    await moveStatus(tx, order, "DELIVERED", actor.id, null);
    await setDeliveryStatus(tx, order, "DELIVERED", actor.id, null);
    await tx.deliveryRecord.update({
      where: { id: record.id },
      data: input.feeCollected ? { deliveredAt: now, collectionStatus: "COLLECTED", collectedAt: now } : { deliveredAt: now, collectionStatus: "EXCEPTION", exceptionNote: note },
    });
    await notifyInTx(tx, { userId: order.customerId, type: "ORDER_DELIVERED", title: "تم توصيل طلبك", body: `تم توصيل الطلب رقم ${order.number}.`, data: { orderId }, dedupeKey: `order-DELIVERED:${orderId}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_DELIVERED", entityType: "Order", entityId: orderId, after: { feeCollected: input.feeCollected } }, tx);
  });
}

/** The driver could not deliver. The shop is told and can give the order to a driver again (or cancel by agreement). */
export async function reportFailure(actor: Actor, orderId: string, reason: string): Promise<LifecycleResult> {
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (clean.length < 3 || clean.length > 300) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const { order } = await loadMyDelivery(tx, actor, orderId);
    if (order.deliveryStatus !== "DRIVER_ASSIGNED" && order.deliveryStatus !== "PICKED_UP") fail("WRONG_STATE");
    await setDeliveryStatus(tx, order, "FAILED", actor.id, clean);
    await notifyInTx(tx, { userId: order.merchant.ownerId, type: "DELIVERY_FAILED", title: "تعذّر التوصيل", body: `أبلغ السائق بتعذر توصيل الطلب رقم ${order.number}: ${clean}.`, data: { orderId }, dedupeKey: `delivery-failed:${orderId}:${Date.now()}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_FAILED", entityType: "Order", entityId: orderId, after: { reason: clean } }, tx);
  });
}

/** A driver's own deliveries (assigned to them). Customer contact and address are shown only for these. */
export async function listMyDeliveries(actor: Actor, scope: "ACTIVE" | "HISTORY") {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  const driver = await db.driver.findUnique({ where: { userId: actor.id } });
  if (!driver || !driver.isActive) return [];
  const rows = await db.deliveryRecord.findMany({
    where: { driverId: driver.id, order: { deliveryStatus: scope === "ACTIVE" ? { in: ["DRIVER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] } : { in: ["DELIVERED", "FAILED"] } } },
    orderBy: { assignedAt: "desc" },
    take: 50,
    include: { order: { select: { id: true, number: true, orderStatus: true, deliveryStatus: true, totalCents: true, deliveryFeeCents: true, addressSnap: true, merchant: { select: { name: true } }, customer: { select: { name: true, phone: true } } } } },
  });
  return rows.map((r) => ({
    orderId: r.orderId,
    number: r.order.number,
    shop: r.order.merchant.name,
    orderStatus: r.order.orderStatus,
    deliveryStatus: r.order.deliveryStatus,
    feeToCollectCents: r.feeExpectedCents,
    collectionStatus: r.collectionStatus,
    address: r.order.addressSnap,
    customer: { name: r.order.customer.name, phone: r.order.customer.phone },
    assignedAt: r.assignedAt,
    deliveredAt: r.deliveredAt,
  }));
}
