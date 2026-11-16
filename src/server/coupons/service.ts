import "server-only";
import { Prisma, type Coupon } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { CODE_PATTERN, normalizeCode, validateCouponValue, type CouponKind, type CouponRule } from "@/lib/coupons/discount";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export type CouponError = "INVALID_REQUEST" | "CODE_TAKEN" | "SHOP_NOT_APPROVED" | "TOO_MANY_COUPONS" | "COUPON_INVALID" | "COUPON_EXPIRED" | "COUPON_NOT_FOR_CART" | "RATE_LIMITED";
export type CouponResult<T = object> = ({ ok: true } & T) | { ok: false; error: CouponError };

const MAX_ACTIVE_PER_SHOP = 20; // technical bound against a runaway list, not a business rule
const MAX_LIFETIME_DAYS = 365;
const DAY_MS = 86_400_000;

export interface CouponInput {
  code: string;
  kind: CouponKind;
  value: number;
  expiresAt: Date;
}

/** A shop owner creates a coupon for their own approved shop (the shop bears it); an admin with offers.manage creates a platform coupon. */
export async function createCoupon(actor: Actor, input: CouponInput): Promise<CouponResult<{ couponId: string }>> {
  let merchantId: string | null = null;
  if (actor.role === "MERCHANT") {
    const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true, status: true } });
    if (!shop) throw new NotFoundError();
    if (shop.status !== "APPROVED") return { ok: false, error: "SHOP_NOT_APPROVED" };
    merchantId = shop.id;
  } else if (!hasPermission(actor, "offers.manage")) {
    throw new AuthorizationError();
  }
  const code = normalizeCode(input?.code);
  const now = Date.now();
  const expires = input?.expiresAt instanceof Date ? input.expiresAt.getTime() : NaN;
  if (!CODE_PATTERN.test(code) || (input.kind !== "PERCENT" && input.kind !== "FIXED") || !validateCouponValue(input.kind, input.value)) return { ok: false, error: "INVALID_REQUEST" };
  if (!Number.isFinite(expires) || expires <= now || expires > now + MAX_LIFETIME_DAYS * DAY_MS) return { ok: false, error: "INVALID_REQUEST" };
  if (merchantId && (await db.coupon.count({ where: { merchantId, isActive: true, expiresAt: { gt: new Date() } } })) >= MAX_ACTIVE_PER_SHOP) return { ok: false, error: "TOO_MANY_COUPONS" };
  try {
    const row = await db.coupon.create({ data: { code, kind: input.kind, value: input.value, merchantId, expiresAt: input.expiresAt, createdById: actor.id } });
    await writeAudit({ actorId: actor.id, action: "COUPON_CREATED", entityType: "Coupon", entityId: row.id, after: { code, kind: input.kind, value: input.value, merchantId } });
    return { ok: true, couponId: row.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "CODE_TAKEN" };
    throw error;
  }
}

async function ownedOrManaged(actor: Actor, id: string): Promise<Coupon> {
  const row = await db.coupon.findUnique({ where: { id: String(id) } });
  if (!row) throw new NotFoundError();
  if (actor.role === "MERCHANT") {
    const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
    if (!shop || row.merchantId !== shop.id) throw new NotFoundError(); // someone else's coupon looks missing
  } else if (!hasPermission(actor, "offers.manage")) {
    throw new AuthorizationError();
  }
  return row;
}

export async function setCouponActive(actor: Actor, id: string, active: boolean): Promise<CouponResult> {
  const row = await ownedOrManaged(actor, id);
  await db.coupon.update({ where: { id: row.id }, data: { isActive: active } });
  await writeAudit({ actorId: actor.id, action: active ? "COUPON_ENABLED" : "COUPON_DISABLED", entityType: "Coupon", entityId: row.id });
  return { ok: true };
}

export interface CouponRow {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  scope: "MERCHANT" | "PLATFORM";
  merchantName: string | null;
  expiresAt: Date;
  isActive: boolean;
  expired: boolean;
  uses: number;
  discountCents: number;
}

/** Usage counts only orders that were not cancelled or rejected. */
export async function listCoupons(actor: Actor): Promise<CouponRow[]> {
  let where: Prisma.CouponWhereInput;
  if (actor.role === "MERCHANT") {
    const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
    if (!shop) throw new NotFoundError();
    where = { merchantId: shop.id };
  } else if (hasPermission(actor, "offers.manage")) {
    where = {};
  } else {
    throw new AuthorizationError();
  }
  const rows = await db.coupon.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  const usage = await db.order.groupBy({
    by: ["couponCode"],
    where: { couponCode: { in: rows.map((r) => r.code) }, orderStatus: { notIn: ["CANCELLED", "REJECTED"] } },
    _count: { _all: true },
    _sum: { discountCents: true },
  });
  const byCode = new Map(usage.map((u) => [u.couponCode, u]));
  const shops = await db.merchant.findMany({ where: { id: { in: rows.flatMap((r) => (r.merchantId ? [r.merchantId] : [])) } }, select: { id: true, name: true } });
  const names = new Map(shops.map((s) => [s.id, s.name]));
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind as CouponKind,
    value: r.value,
    scope: r.merchantId ? "MERCHANT" : "PLATFORM",
    merchantName: r.merchantId ? (names.get(r.merchantId) ?? null) : null,
    expiresAt: r.expiresAt,
    isActive: r.isActive,
    expired: r.expiresAt.getTime() <= now,
    uses: byCode.get(r.code)?._count._all ?? 0,
    discountCents: byCode.get(r.code)?._sum.discountCents ?? 0,
  }));
}

export interface UsableCoupon extends CouponRule {
  code: string;
}

/** Finds the coupon for a cart. It must be active, unexpired, and either a platform coupon or one of a shop that is in the cart. */
export async function findUsableCoupon(client: Prisma.TransactionClient | typeof db, rawCode: unknown, cartMerchantIds: readonly string[], now: Date): Promise<CouponResult<{ coupon: UsableCoupon }>> {
  const code = normalizeCode(rawCode);
  if (!CODE_PATTERN.test(code)) return { ok: false, error: "COUPON_INVALID" };
  const row = await client.coupon.findUnique({ where: { code } });
  if (!row || !row.isActive) return { ok: false, error: "COUPON_INVALID" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "COUPON_EXPIRED" };
  if (row.merchantId !== null && !cartMerchantIds.includes(row.merchantId)) return { ok: false, error: "COUPON_NOT_FOR_CART" };
  return { ok: true, coupon: { code: row.code, kind: row.kind as CouponKind, value: row.value, merchantId: row.merchantId } };
}

/** For the checkout page: is this code usable for this cart? The final discount is still decided inside the order transaction. */
export async function checkCouponForCart(actor: Actor, rawCode: string, cartMerchantIds: readonly string[]): Promise<CouponResult<{ coupon: UsableCoupon }>> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  if (!(await consumeRateLimit(`coupon:check:${actor.id}`, 30, 3600))) return { ok: false, error: "RATE_LIMITED" };
  return findUsableCoupon(db, rawCode, cartMerchantIds, new Date());
}
