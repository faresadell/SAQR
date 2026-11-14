import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { buildCommissionSnapshot } from "@/server/commissions/service";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";
import { merchantCanTrade, resolveOrderContext, type PlaceOrderError } from "@/server/orders/checkout";

export type RequestError =
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "TOO_MANY_OPEN"
  | "SHOP_UNAVAILABLE"
  | "ADDRESS_NOT_FOUND"
  | "WRONG_STATE"
  | PlaceOrderError;
export type RequestResult<T = object> = ({ ok: true } & T) | { ok: false; error: RequestError };

export const MAX_REQUEST_LENGTH = 1000;
export const MAX_QUOTE_CENTS = 5_000_000; // sanity bound (50,000 EGP), not a business rule
const MAX_OPEN_PER_SHOP = 3;

class Abort extends Error {
  constructor(readonly error: RequestError) {
    super(error);
  }
}

const text = (v: unknown, min: number, max: number): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length >= min && t.length <= max ? t : null;
};

async function ownShopId(actor: Actor): Promise<string> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
  if (!shop) throw new NotFoundError();
  return shop.id;
}

/** The request only if the actor is its customer or the shop owner it was sent to; anyone else gets NotFound. */
async function loadFor(actor: Actor, id: string) {
  const row = await db.orderRequest.findUnique({ where: { id: String(id).slice(0, 64) } });
  if (!row) throw new NotFoundError();
  if (actor.role === "CUSTOMER" && row.customerId === actor.id) return { row, side: "customer" as const };
  if (actor.role === "MERCHANT" && row.merchantId === (await ownShopId(actor))) return { row, side: "merchant" as const };
  throw new NotFoundError();
}

/** The customer describes what they want from one approved shop, in their own words. No product catalog needed. */
export async function createOrderRequest(actor: Actor, input: { merchantId: string; addressId: string; body: string }): Promise<RequestResult<{ requestId: string }>> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  const body = text(input.body, 3, MAX_REQUEST_LENGTH);
  if (!body || typeof input.addressId !== "string") return { ok: false, error: "INVALID_REQUEST" };
  const shop = await db.merchant.findUnique({ where: { id: String(input.merchantId) }, select: { id: true, ownerId: true, status: true, name: true } });
  if (!shop || shop.status !== "APPROVED") return { ok: false, error: "SHOP_UNAVAILABLE" };
  if (!(await db.address.findFirst({ where: { id: input.addressId, userId: actor.id }, select: { id: true } }))) return { ok: false, error: "ADDRESS_NOT_FOUND" };
  if (!(await consumeRateLimit(`order-request:${actor.id}`, 10, 600))) return { ok: false, error: "RATE_LIMITED" };
  return db.$transaction(async (tx): Promise<RequestResult<{ requestId: string }>> => {
    const open = await tx.orderRequest.count({ where: { customerId: actor.id, merchantId: shop.id, status: { in: ["PENDING_QUOTE", "QUOTED"] } } });
    if (open >= MAX_OPEN_PER_SHOP) return { ok: false, error: "TOO_MANY_OPEN" };
    const row = await tx.orderRequest.create({ data: { customerId: actor.id, merchantId: shop.id, addressId: input.addressId, body } });
    await notifyInTx(tx, { userId: shop.ownerId, type: "ORDER_REQUEST_NEW", title: "طلب جديد بانتظار سعرك", body: body.length > 80 ? `${body.slice(0, 80)}…` : body, data: { requestId: row.id }, dedupeKey: `order-request-new:${row.id}` });
    await writeAudit({ actorId: actor.id, action: "ORDER_REQUEST_CREATED", entityType: "OrderRequest", entityId: row.id, after: { merchantId: shop.id } }, tx);
    return { ok: true, requestId: row.id };
  });
}

/** The shop answers once with the final products price (delivery is added separately by the platform). No back-and-forth on price. */
export async function quoteOrderRequest(actor: Actor, id: string, input: { subtotalCents: number; note?: string | null }): Promise<RequestResult> {
  const { row, side } = await loadFor(actor, id);
  if (side !== "merchant") throw new AuthorizationError();
  const note = input.note ? text(input.note, 1, 300) : null;
  if (!Number.isInteger(input.subtotalCents) || input.subtotalCents < 100 || input.subtotalCents > MAX_QUOTE_CENTS || (input.note && !note)) return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx): Promise<RequestResult> => {
    const moved = await tx.orderRequest.updateMany({ where: { id: row.id, status: "PENDING_QUOTE" }, data: { status: "QUOTED", quotedSubtotalCents: input.subtotalCents, quoteNote: note, quotedAt: new Date() } });
    if (moved.count !== 1) return { ok: false, error: "WRONG_STATE" };
    const shop = await tx.merchant.findUnique({ where: { id: row.merchantId }, select: { name: true } });
    await notifyInTx(tx, { userId: row.customerId, type: "ORDER_REQUEST_QUOTED", title: `${shop?.name ?? "النشاط"} حدّد سعر طلبك`, body: "راجع السعر النهائي ووافق عليه لإنشاء الطلب.", data: { requestId: row.id }, dedupeKey: `order-request-quoted:${row.id}` });
    await writeAudit({ actorId: actor.id, action: "ORDER_REQUEST_QUOTED", entityType: "OrderRequest", entityId: row.id, after: { subtotalCents: input.subtotalCents } }, tx);
    return { ok: true };
  });
}

/** Shop declines (customer is told), or the customer cancels, while no order exists yet. */
export async function closeOrderRequest(actor: Actor, id: string): Promise<RequestResult> {
  const { row, side } = await loadFor(actor, id);
  const status = side === "merchant" ? "DECLINED" : "CANCELLED";
  const from = side === "merchant" ? ["PENDING_QUOTE"] : ["PENDING_QUOTE", "QUOTED"];
  return db.$transaction(async (tx): Promise<RequestResult> => {
    const moved = await tx.orderRequest.updateMany({ where: { id: row.id, status: { in: from as ("PENDING_QUOTE" | "QUOTED")[] } }, data: { status, decidedAt: new Date() } });
    if (moved.count !== 1) return { ok: false, error: "WRONG_STATE" };
    if (side === "merchant") await notifyInTx(tx, { userId: row.customerId, type: "ORDER_REQUEST_DECLINED", title: "اعتذر النشاط عن طلبك", body: "يمكنك إرسال طلب إلى نشاط آخر.", data: { requestId: row.id }, dedupeKey: `order-request-declined:${row.id}` });
    await writeAudit({ actorId: actor.id, action: side === "merchant" ? "ORDER_REQUEST_DECLINED" : "ORDER_REQUEST_CANCELLED", entityType: "OrderRequest", entityId: row.id }, tx);
    return { ok: true };
  });
}

/**
 * The customer accepts the shop's final price. This creates a NORMAL order (same rules as a cart order: stars, address zone,
 * delivery fee, commission on the products price) with one custom line, then payment and approval continue as usual.
 */
export async function acceptOrderQuote(actor: Actor, id: string): Promise<RequestResult<{ parentOrderId: string; orderId: string }>> {
  const { row, side } = await loadFor(actor, id);
  if (side !== "customer") throw new AuthorizationError();
  try {
    return await db.$transaction(async (tx): Promise<RequestResult<{ parentOrderId: string; orderId: string }>> => {
      const now = new Date();
      const fresh = await tx.orderRequest.findUnique({ where: { id: row.id } });
      if (!fresh || fresh.status !== "QUOTED" || fresh.quotedSubtotalCents === null) throw new Abort("WRONG_STATE");
      const context = await resolveOrderContext(tx, actor.id, fresh.addressId, now);
      if (!context.ok) throw new Abort(context.error);
      const { address, zone } = context;
      const merchant = await tx.merchant.findUnique({ where: { id: fresh.merchantId }, include: { owner: true } });
      if (!merchant || !(await merchantCanTrade(tx, merchant, now))) throw new Abort("MERCHANT_UNAVAILABLE");
      const subtotal = fresh.quotedSubtotalCents;
      const total = subtotal + zone.feeCents;
      const addressSnap = { label: address.label, line: address.line, lat: address.lat, lng: address.lng, zoneId: zone.zoneId };
      const parent = await tx.parentOrder.create({ data: { customerId: actor.id, idempotencyKey: `request-${fresh.id}`, subtotalCents: subtotal, deliveryFeeCents: zone.feeCents, totalCents: total, addressSnap } });
      const commission = await buildCommissionSnapshot(merchant.tier, subtotal, now, tx);
      const order = await tx.order.create({
        data: {
          parentOrderId: parent.id, customerId: actor.id, merchantId: merchant.id, subtotalCents: subtotal, deliveryFeeCents: zone.feeCents, totalCents: total,
          merchantTierSnap: commission.merchantTierSnap, commissionBp: commission.commissionBp, commissionBaseCents: commission.commissionBaseCents, commissionCents: commission.commissionCents,
          deliveryRuleSnap: { zoneId: zone.zoneId, feeVersionId: zone.feeVersionId, feeCents: zone.feeCents }, addressSnap,
          items: { create: [{ productId: null, nameSnapshot: `طلب مخصص: ${fresh.body.slice(0, 100)}`, unitPriceCents: subtotal, quantity: 1, lineTotalCents: subtotal }] },
          events: { create: [{ field: "orderStatus", toValue: "AWAITING_PAYMENT", actorId: actor.id, note: "created from accepted quote" }] },
        },
      });
      await tx.orderRequest.update({ where: { id: fresh.id }, data: { status: "ACCEPTED", decidedAt: now, parentOrderId: parent.id } });
      await notifyInTx(tx, { userId: merchant.ownerId, type: "ORDER_REQUEST_ACCEPTED", title: "وافق العميل على سعرك", body: `تم إنشاء الطلب رقم ${order.number} وبانتظار دفع العميل.`, data: { requestId: fresh.id, orderId: order.id }, dedupeKey: `order-request-accepted:${fresh.id}` });
      await writeAudit({ actorId: actor.id, action: "ORDER_REQUEST_ACCEPTED", entityType: "OrderRequest", entityId: fresh.id, after: { orderId: order.id, subtotalCents: subtotal } }, tx);
      return { ok: true, parentOrderId: parent.id, orderId: order.id };
    });
  } catch (error) {
    if (error instanceof Abort) return { ok: false, error: error.error };
    throw error;
  }
}

const select = { id: true, body: true, status: true, quotedSubtotalCents: true, quoteNote: true, createdAt: true, merchantId: true, customerId: true, parentOrderId: true } as const;

export async function listOrderRequests(actor: Actor) {
  const where = actor.role === "CUSTOMER" ? { customerId: actor.id } : { merchantId: await ownShopId(actor) };
  const rows = await db.orderRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, select });
  const [shops, customers] = await Promise.all([
    db.merchant.findMany({ where: { id: { in: rows.map((r) => r.merchantId) } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: rows.map((r) => r.customerId) } }, select: { id: true, name: true } }),
  ]);
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), who: actor.role === "CUSTOMER" ? (shopName.get(r.merchantId) ?? "النشاط") : (customerName.get(r.customerId) ?? "عميل") }));
}

export async function getOrderRequest(actor: Actor, id: string) {
  const { row, side } = await loadFor(actor, id);
  const [shop, customer] = await Promise.all([db.merchant.findUnique({ where: { id: row.merchantId }, select: { name: true } }), db.user.findUnique({ where: { id: row.customerId }, select: { name: true } })]);
  return { id: row.id, side, body: row.body, status: row.status, quotedSubtotalCents: row.quotedSubtotalCents, quoteNote: row.quoteNote, parentOrderId: row.parentOrderId, createdAt: row.createdAt.toISOString(), who: side === "customer" ? (shop?.name ?? "النشاط") : (customer?.name ?? "عميل") };
}
