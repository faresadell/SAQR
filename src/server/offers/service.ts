import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { appliedUnitDiscountCents, checkDiscount, type Discount } from "@/lib/offers/discount";
import { getSetting } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";
import { applyStarMove, InsufficientStarsError } from "@/server/stars/ledger";

export type OfferError =
  | "INVALID_REQUEST"
  | "SHOP_NOT_APPROVED"
  | "OFFER_NOT_ACTIVE"
  | "INSUFFICIENT_STARS"
  | "WRONG_STATE"
  | "CONFLICT"
  | "DISCOUNTS_DISABLED"
  | "DISCOUNT_INVALID"
  | "DISCOUNT_ABOVE_LIMIT"
  | "FINAL_PRICE_NOT_POSITIVE"
  | "TOO_MANY_DISCOUNTED_OFFERS"
  | "PRODUCT_ALREADY_IN_OFFER";
export type OfferResult<T = object> = ({ ok: true } & T) | { ok: false; error: OfferError };

const HOUR_MS = 3_600_000;
/** Technical sanity bound for ONE extension request (the shop's star balance is the real limit). Not a business rule. */
export const MAX_HOURS_PER_REQUEST = 1000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type OfferState = "ACTIVE" | "EXPIRED" | "STOPPED";
export function offerState(o: { status: "ACTIVE" | "STOPPED"; endsAt: Date }, now = new Date()): OfferState {
  if (o.status === "STOPPED") return "STOPPED";
  return o.endsAt.getTime() > now.getTime() ? "ACTIVE" : "EXPIRED";
}

const cleanText = (value: unknown, min: number, max: number): string | null => {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length >= min && v.length <= max ? v : null;
};

async function ownShop(actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop) throw new NotFoundError();
  return shop;
}

export interface OfferInput {
  title: string;
  description?: string | null;
  /** Optional. A discounted offer needs `discount` AND `productIds` (products of this shop). Off until an administrator enables discounts. */
  discount?: { type: "PERCENT" | "FIXED"; value: number } | null;
  productIds?: string[];
}

const MAX_PRODUCTS_PER_OFFER = 50;
const ACTIVE_DISCOUNTED = (now: Date): Prisma.OfferWhereInput => ({ status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now }, discountType: { not: null } });

/**
 * Creates an offer that lasts the configured base duration (24 h by default). Free: only extensions cost stars.
 * A discount (percent or fixed per unit) is checked against the administrator's limits and every product's price:
 * it can never make a final price zero or negative, one product is in at most one running discounted offer, and nothing
 * is accepted while discounts are switched off.
 */
export async function createOffer(actor: Actor, input: OfferInput): Promise<OfferResult<{ offerId: string; endsAt: Date }>> {
  const shop = await ownShop(actor);
  if (shop.status !== "APPROVED") return { ok: false, error: "SHOP_NOT_APPROVED" };
  const title = cleanText(input.title, 3, 80);
  const description = input.description == null || input.description === "" ? null : cleanText(input.description, 1, 500);
  if (!title || (input.description != null && input.description !== "" && !description)) return { ok: false, error: "INVALID_REQUEST" };
  const discount: Discount | null = input.discount ? { type: input.discount.type, value: input.discount.value } : null;
  const productIds = [...new Set(input.productIds ?? [])];
  if (discount ? productIds.length < 1 || productIds.length > MAX_PRODUCTS_PER_OFFER || (discount.type !== "PERCENT" && discount.type !== "FIXED") : productIds.length > 0) return { ok: false, error: "INVALID_REQUEST" };
  if (productIds.some((id) => typeof id !== "string" || id.length < 8 || id.length > 64)) return { ok: false, error: "INVALID_REQUEST" };
  if (discount && (await getSetting("offers.discount.enabled")) !== 1) return { ok: false, error: "DISCOUNTS_DISABLED" };
  const hours = await getSetting("offers.base_duration_hours");
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + hours * HOUR_MS);
  const limits = discount ? { maxPercent: await getSetting("offers.discount.max_percent"), maxFixedCents: (await getSetting("offers.discount.max_fixed_egp")) * 100 } : null;
  const maxActive = discount ? await getSetting("offers.discount.max_active_per_shop") : 0;
  return db.$transaction(async (tx): Promise<OfferResult<{ offerId: string; endsAt: Date }>> => {
    if (discount) {
      await tx.$queryRaw`SELECT "id" FROM "Merchant" WHERE "id" = ${shop.id} FOR UPDATE`; // one discounted offer is created per shop at a time
      const products = await tx.product.findMany({ where: { id: { in: productIds }, merchantId: shop.id, archivedAt: null }, select: { id: true, priceCents: true } });
      if (products.length !== productIds.length) return { ok: false, error: "INVALID_REQUEST" };
      const problem = checkDiscount(discount, products.map((p) => p.priceCents), limits!);
      if (problem) return { ok: false, error: problem === "ABOVE_LIMIT" ? "DISCOUNT_ABOVE_LIMIT" : problem === "INVALID_VALUE" ? "DISCOUNT_INVALID" : "FINAL_PRICE_NOT_POSITIVE" };
      if ((await tx.offer.count({ where: { merchantId: shop.id, ...ACTIVE_DISCOUNTED(startsAt) } })) >= maxActive) return { ok: false, error: "TOO_MANY_DISCOUNTED_OFFERS" };
      if ((await tx.offerProduct.count({ where: { productId: { in: productIds }, offer: ACTIVE_DISCOUNTED(startsAt) } })) > 0) return { ok: false, error: "PRODUCT_ALREADY_IN_OFFER" };
    }
    const created = await tx.offer.create({
      data: {
        merchantId: shop.id, title, description, startsAt, endsAt,
        ...(discount ? { discountType: discount.type, discountValue: discount.value, products: { create: productIds.map((productId) => ({ productId })) } } : {}),
      },
    });
    await writeAudit({ actorId: actor.id, action: "OFFER_CREATED", entityType: "Offer", entityId: created.id, after: { title, hours, ...(discount ? { discount, productIds } : {}) } }, tx);
    return { ok: true, offerId: created.id, endsAt: created.endsAt };
  });
}

/**
 * Discounts that apply right now, per product (used INSIDE the checkout transaction with fresh prices).
 * Nothing applies while discounts are switched off. When two running offers somehow cover a product, the one that
 * is better for the customer wins (no stacking).
 */
export async function resolveOfferDiscounts(client: Prisma.TransactionClient | typeof db, products: readonly { id: string; priceCents: number }[], now: Date): Promise<Map<string, { offerId: string; unitDiscountCents: number }>> {
  const result = new Map<string, { offerId: string; unitDiscountCents: number }>();
  if (products.length === 0 || (await getSetting("offers.discount.enabled")) !== 1) return result;
  const price = new Map(products.map((p) => [p.id, p.priceCents]));
  const rows = await client.offerProduct.findMany({
    where: { productId: { in: [...price.keys()] }, offer: { ...ACTIVE_DISCOUNTED(now), merchant: { status: "APPROVED" } } },
    select: { productId: true, offer: { select: { id: true, discountType: true, discountValue: true } } },
  });
  for (const row of rows) {
    const { discountType, discountValue } = row.offer;
    if (!discountType || discountValue === null) continue;
    const unitDiscountCents = appliedUnitDiscountCents({ type: discountType, value: discountValue }, price.get(row.productId)!);
    if (unitDiscountCents <= 0) continue; // would not leave a positive price: sold at the normal price
    const best = result.get(row.productId);
    if (!best || unitDiscountCents > best.unitDiscountCents || (unitDiscountCents === best.unitDiscountCents && row.offer.id < best.offerId)) result.set(row.productId, { offerId: row.offer.id, unitDiscountCents });
  }
  return result;
}

/** Text of a running offer can be corrected. Dates and prices are not editable here (time changes only by paid extension). */
export async function updateOffer(actor: Actor, offerId: string, change: { title?: string; description?: string | null }): Promise<OfferResult> {
  const shop = await ownShop(actor);
  let title: string | undefined;
  let description: string | null | undefined;
  if (change.title !== undefined) {
    const t = cleanText(change.title, 3, 80);
    if (t === null) return { ok: false, error: "INVALID_REQUEST" };
    title = t;
  }
  if (change.description !== undefined) {
    if (change.description === null || change.description === "") description = null; // clears it
    else {
      const t = cleanText(change.description, 1, 500);
      if (t === null) return { ok: false, error: "INVALID_REQUEST" };
      description = t;
    }
  }
  if (title === undefined && description === undefined) return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx): Promise<OfferResult> => {
    const offer = await tx.offer.findUnique({ where: { id: offerId } });
    if (!offer || offer.merchantId !== shop.id) throw new NotFoundError();
    if (offerState(offer) !== "ACTIVE") return { ok: false, error: "OFFER_NOT_ACTIVE" };
    await tx.offer.update({ where: { id: offerId }, data: { ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}) } });
    await writeAudit({ actorId: actor.id, action: "OFFER_UPDATED", entityType: "Offer", entityId: offerId, before: { title: offer.title, description: offer.description }, after: { title: title ?? offer.title, description: description === undefined ? offer.description : description } }, tx);
    return { ok: true };
  });
}

/** The owner stops their offer; an admin with offers.manage can stop any offer (a reason is required for the admin). */
export async function stopOffer(actor: Actor, offerId: string, reason?: string): Promise<OfferResult> {
  const clean = reason?.trim() ?? "";
  if (clean.length > 300) return { ok: false, error: "INVALID_REQUEST" };
  const isAdmin = hasPermission(actor, "offers.manage");
  if (isAdmin && clean.length < 3) return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx): Promise<OfferResult> => {
    const offer = await tx.offer.findUnique({ where: { id: offerId }, include: { merchant: true } });
    if (!offer) throw new NotFoundError();
    const isOwner = actor.role === "MERCHANT" && offer.merchant.ownerId === actor.id;
    if (!isOwner && !isAdmin) throw new NotFoundError();
    // Compare-and-set: two stops cannot both win.
    const changed = await tx.offer.updateMany({ where: { id: offerId, status: "ACTIVE" }, data: { status: "STOPPED", stoppedAt: new Date(), stoppedById: actor.id, stopReason: clean || null } });
    if (changed.count !== 1) return { ok: false, error: "WRONG_STATE" };
    if (!isOwner) await notifyInTx(tx, { userId: offer.merchant.ownerId, type: "OFFER_STOPPED", title: "تم إيقاف عرضك", body: `أوقفت الإدارة العرض "${offer.title}": ${clean}.`, data: { offerId }, dedupeKey: `offer-stopped:${offerId}` });
    await writeAudit({ actorId: actor.id, action: "OFFER_STOPPED", entityType: "Offer", entityId: offerId, after: { reason: clean || null, byAdmin: !isOwner } }, tx);
    return { ok: true };
  });
}

/**
 * Extends a running offer by whole hours. Cost = hours x the per-hour star setting (1 by default), charged to the shop owner
 * once per idempotency key: a retry returns the first result and never charges again.
 */
export async function extendOffer(actor: Actor, offerId: string, input: { hours: number; idempotencyKey: string }): Promise<OfferResult<{ endsAt: Date; starsCharged: number; replayed: boolean }>> {
  const shop = await ownShop(actor);
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > MAX_HOURS_PER_REQUEST || !KEY_PATTERN.test(String(input.idempotencyKey))) return { ok: false, error: "INVALID_REQUEST" };
  const perHour = await getSetting("offers.extension_stars_per_hour");
  try {
    return await db.$transaction(async (tx): Promise<OfferResult<{ endsAt: Date; starsCharged: number; replayed: boolean }>> => {
      const offer = await tx.offer.findUnique({ where: { id: offerId } });
      if (!offer || offer.merchantId !== shop.id) throw new NotFoundError();
      const earlier = await tx.offerExtension.findUnique({ where: { offerId_idempotencyKey: { offerId, idempotencyKey: input.idempotencyKey } } });
      if (earlier) return { ok: true, endsAt: offer.endsAt, starsCharged: earlier.starsCharged, replayed: true };
      if (offerState(offer) !== "ACTIVE") return { ok: false, error: "OFFER_NOT_ACTIVE" };
      const cost = input.hours * perHour;
      if (cost > 0) await applyStarMove(tx, { userId: actor.id, amount: -cost, reason: "OFFER_EXTENSION", actorId: actor.id, note: `offer ${offerId} +${input.hours}h`, idempotencyKey: `offer-ext:${offerId}:${input.idempotencyKey}` });
      const endsAt = new Date(offer.endsAt.getTime() + input.hours * HOUR_MS);
      // Compare-and-set on the old end time: a parallel extension with another key cannot overwrite this one.
      const moved = await tx.offer.updateMany({ where: { id: offerId, status: "ACTIVE", endsAt: offer.endsAt }, data: { endsAt } });
      if (moved.count !== 1) throw new ConflictAbort();
      await tx.offerExtension.create({ data: { offerId, hours: input.hours, starsCharged: cost, actorId: actor.id, idempotencyKey: input.idempotencyKey } });
      await writeAudit({ actorId: actor.id, action: "OFFER_EXTENDED", entityType: "Offer", entityId: offerId, after: { hours: input.hours, starsCharged: cost, endsAt: endsAt.toISOString() } }, tx);
      return { ok: true, endsAt, starsCharged: cost, replayed: false };
    });
  } catch (error) {
    if (error instanceof InsufficientStarsError) return { ok: false, error: "INSUFFICIENT_STARS" };
    if (error instanceof ConflictAbort) return { ok: false, error: "CONFLICT" };
    throw error;
  }
}

class ConflictAbort extends Error {}

const offerSelect = { id: true, title: true, description: true, startsAt: true, endsAt: true, status: true, stoppedAt: true, stopReason: true, createdAt: true, discountType: true, discountValue: true } as const;

export async function listMyOffers(actor: Actor) {
  const shop = await ownShop(actor);
  const rows = await db.offer.findMany({ where: { merchantId: shop.id }, orderBy: { createdAt: "desc" }, take: 100, select: offerSelect });
  const now = new Date();
  return rows.map((o) => ({ ...o, state: offerState(o, now) }));
}

/** What shoppers see: running offers of approved shops. Discount details appear only while discounts are switched on. */
export async function listPublicOffers() {
  const now = new Date();
  const discountsOn = (await getSetting("offers.discount.enabled")) === 1;
  const rows = await db.offer.findMany({
    where: { status: "ACTIVE", endsAt: { gt: now }, merchant: { status: "APPROVED" } },
    orderBy: { endsAt: "asc" },
    take: 100,
    select: {
      id: true, title: true, description: true, endsAt: true, discountType: true, discountValue: true,
      merchant: { select: { id: true, name: true } },
      products: { select: { product: { select: { id: true, nameAr: true, priceCents: true, archivedAt: true } } } },
    },
  });
  return rows.map((o) => {
    const discount = discountsOn && o.discountType && o.discountValue !== null ? { type: o.discountType, value: o.discountValue } : null;
    return {
      id: o.id, title: o.title, description: o.description, endsAt: o.endsAt, shop: o.merchant,
      discount,
      products: discount
        ? o.products.filter((p) => p.product.archivedAt === null).map((p) => {
            const unit = appliedUnitDiscountCents(discount, p.product.priceCents);
            return { id: p.product.id, name: p.product.nameAr, priceCents: p.product.priceCents, finalPriceCents: p.product.priceCents - unit };
          })
        : [],
    };
  });
}

export async function listOffersForAdmin(actor: Actor, filter: "ALL" | OfferState = "ALL") {
  if (!hasPermission(actor, "offers.manage")) throw new AuthorizationError();
  const now = new Date();
  const where = filter === "ALL" ? {} : filter === "STOPPED" ? { status: "STOPPED" as const } : filter === "ACTIVE" ? { status: "ACTIVE" as const, endsAt: { gt: now } } : { status: "ACTIVE" as const, endsAt: { lte: now } };
  const rows = await db.offer.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select: { ...offerSelect, merchant: { select: { id: true, name: true } } } });
  return rows.map((o) => ({ ...o, state: offerState(o, now) }));
}
