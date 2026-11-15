import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";
import { fail, moveStatus, run, type LifecycleResult, type OrderRow, type Tx } from "@/server/orders/lifecycle";

/** Order stages in which a driver can be given the order (it is accepted, paid and not yet delivered). */
const ASSIGNABLE_ORDER = ["APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const;
/** Delivery stages from which (re)assignment is allowed: nothing is on the road, or the last attempt failed. */
const REASSIGNABLE: readonly DeliveryStatus[] = ["NOT_STARTED", "AWAITING_DRIVER", "DRIVER_ASSIGNED", "FAILED"];

export async function setDeliveryStatus(tx: Tx, order: OrderRow, to: DeliveryStatus, actorId: string, note: string | null): Promise<void> {
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
    if (record.feeStatus !== "APPROVED") fail("FEE_NOT_APPROVED"); // the customer must agree to the driver's price first
    if (order.orderStatus === "READY") await moveStatus(tx, order, "OUT_FOR_DELIVERY", actor.id, "picked up by driver");
    else if (order.orderStatus !== "OUT_FOR_DELIVERY") fail("WRONG_STATE"); // the shop has not finished preparing it
    await setDeliveryStatus(tx, order, "PICKED_UP", actor.id, null);
    await tx.deliveryRecord.update({ where: { id: record.id }, data: { pickedUpAt: new Date() } });
    // The handover code is created once and shown only to the customer; the driver must type it to deliver.
    const code = order.deliveryCode ?? String(randomInt(0, 10_000)).padStart(4, "0");
    if (!order.deliveryCode) await tx.order.update({ where: { id: order.id }, data: { deliveryCode: code } });
    await notifyInTx(tx, { userId: order.customerId, type: "ORDER_OUT_FOR_DELIVERY", title: "طلبك في الطريق", body: `خرج الطلب رقم ${order.number} للتوصيل. كود التسليم: ${code}. أعطه للمندوب عند الاستلام فقط.`, data: { orderId }, dedupeKey: `order-OUT_FOR_DELIVERY:${orderId}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_PICKED_UP", entityType: "Order", entityId: orderId }, tx);
  });
}

export interface DeliverInput {
  feeCollected: boolean;
  /** Required when the fee was not collected (what happened). */
  note?: string;
  /** The 4-digit code the customer shows. Required for every order that has one. */
  code?: string;
}

const CODE_ATTEMPTS = 5;
const CODE_WINDOW_SECONDS = 15 * 60;
const sameCode = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Delivered. The delivery fee is paid in cash to the driver: it is recorded as COLLECTED, or as an EXCEPTION with a note. */
export async function deliver(actor: Actor, orderId: string, input: DeliverInput): Promise<LifecycleResult> {
  const note = input.note?.trim() ?? "";
  if (typeof input.feeCollected !== "boolean" || note.length > 300 || (!input.feeCollected && note.length < 3)) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const { record, order } = await loadMyDelivery(tx, actor, orderId);
    if (order.deliveryStatus !== "PICKED_UP" || order.orderStatus !== "OUT_FOR_DELIVERY") fail("WRONG_STATE");
    // Orders picked up before codes existed have none and are delivered as before.
    if (order.deliveryCode) {
      const key = `delivery-code:${orderId}`;
      const since = new Date(Date.now() - CODE_WINDOW_SECONDS * 1000);
      // Locked out after too many wrong tries, even for the right code, so the 10,000 combinations cannot be walked through.
      if ((await db.rateLimitHit.count({ where: { key, createdAt: { gte: since } } })) >= CODE_ATTEMPTS) fail("TOO_MANY_ATTEMPTS");
      if (!sameCode(order.deliveryCode, (input.code ?? "").trim())) {
        await consumeRateLimit(key, CODE_ATTEMPTS, CODE_WINDOW_SECONDS); // separate connection: the wrong try is counted even though this transaction rolls back
        fail("INVALID_CODE");
      }
    }
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
    feeStatus: r.feeStatus,
    maxFeeCents: maxDriverFeeCents(r.order.deliveryFeeCents),
    address: r.order.addressSnap,
    customer: { name: r.order.customer.name, phone: r.order.customer.phone },
    assignedAt: r.assignedAt,
    deliveredAt: r.deliveredAt,
  }));
}

/** The driver may ask at most this much: twice the zone's reference fee, and never less than 50 EGP of room. */
export const maxDriverFeeCents = (referenceCents: number): number => Math.max(referenceCents * 2, 5_000);

/** The driver who took the order from the board names the delivery price; the customer is asked to approve it. Can be re-proposed until approved. */
export async function proposeDeliveryFee(actor: Actor, orderId: string, feeCents: number): Promise<LifecycleResult> {
  if (!Number.isInteger(feeCents) || feeCents < 100) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const { record, order } = await loadMyDelivery(tx, actor, orderId);
    if (order.deliveryStatus !== "DRIVER_ASSIGNED" || record.feeStatus === "APPROVED") fail("WRONG_STATE");
    if (feeCents > maxDriverFeeCents(order.deliveryFeeCents)) fail("FEE_TOO_HIGH");
    await tx.deliveryRecord.update({ where: { id: record.id }, data: { feeExpectedCents: feeCents, feeStatus: "PROPOSED" } });
    await notifyInTx(tx, { userId: order.customerId, type: "DELIVERY_FEE_PROPOSED", title: "وافق على سعر التوصيل", body: `المندوب طلب ${(feeCents / 100).toFixed(2)} ج.م توصيل للطلب رقم ${order.number}. وافق أو ارفض من صفحة الطلب. تدفعه للمندوب كاش.`, data: { orderId }, dedupeKey: `fee-proposed:${orderId}:${feeCents}:${Date.now()}` });
    await writeAudit({ actorId: actor.id, action: "DELIVERY_FEE_PROPOSED", entityType: "Order", entityId: orderId, after: { feeCents } }, tx);
  });
}

/** The customer answers the driver's price. Approving lets the driver pick up; refusing sends the order back to the open board. */
export async function answerDeliveryFee(actor: Actor, orderId: string, approve: boolean): Promise<LifecycleResult> {
  return run(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { merchant: true, delivery: { include: { driver: true } } } });
    if (!order || actor.role !== "CUSTOMER" || order.customerId !== actor.id) throw new NotFoundError();
    const record = order.delivery;
    if (!record || order.deliveryStatus !== "DRIVER_ASSIGNED" || record.feeStatus !== "PROPOSED") fail("WRONG_STATE");
    const driverUserId = record!.driver?.userId;
    if (approve) {
      await tx.deliveryRecord.update({ where: { id: record!.id }, data: { feeStatus: "APPROVED" } });
      if (driverUserId) await notifyInTx(tx, { userId: driverUserId, type: "DELIVERY_FEE_APPROVED", title: "العميل وافق على السعر", body: `وافق العميل على توصيل الطلب رقم ${order.number} بـ ${(record!.feeExpectedCents / 100).toFixed(2)} ج.م.`, data: { orderId }, dedupeKey: `fee-approved:${orderId}:${Date.now()}` });
    } else {
      await setDeliveryStatus(tx, order, "AWAITING_DRIVER", actor.id, "customer refused the driver's price");
      await tx.deliveryRecord.update({ where: { id: record!.id }, data: { driverId: null, assignedAt: null, feeStatus: "NONE", feeExpectedCents: order.deliveryFeeCents } });
      if (driverUserId) await notifyInTx(tx, { userId: driverUserId, type: "DELIVERY_FEE_REFUSED", title: "العميل رفض السعر", body: `رفض العميل سعر توصيل الطلب رقم ${order.number} وعاد الطلب للقائمة.`, data: { orderId }, dedupeKey: `fee-refused:${orderId}:${Date.now()}` });
    }
    await writeAudit({ actorId: actor.id, action: approve ? "DELIVERY_FEE_APPROVED" : "DELIVERY_FEE_REFUSED", entityType: "Order", entityId: orderId }, tx);
  });
}
