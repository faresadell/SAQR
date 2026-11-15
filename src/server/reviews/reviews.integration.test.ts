/**
 * Reviews integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/server/errors";
import { createReview, getShopRating, listShopReviews, reviewedOrderIds, setReviewHidden } from "@/server/reviews/service";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
let n = 0;

async function user(role: "CUSTOMER" | "MERCHANT", name: string) {
  n += 1;
  return db.user.create({ data: { phone: `+2015${String(n).padStart(8, "0")}`, name, passwordHash: "x", role, status: "ACTIVE" } });
}
const asActor = (u: { id: string; role: string }): Actor => ({ id: u.id, role: u.role as Actor["role"], isSuperAdmin: false, permissions: [] });

async function setup() {
  const c = await user("CUSTOMER", "منى أحمد");
  const m = await user("MERCHANT", "تاجر");
  const shop = await db.merchant.create({ data: { ownerId: m.id, name: "متجر", businessType: "restaurant", status: "APPROVED" } });
  const order = async (status: "DELIVERED" | "PREPARING" = "DELIVERED") =>
    db.order.create({ data: { customerId: c.id, merchantId: shop.id, orderStatus: status, subtotalCents: 10_000, deliveryFeeCents: 0, totalCents: 10_000, merchantTierSnap: "REGULAR", commissionBp: 0, commissionBaseCents: 10_000, commissionCents: 0, deliveryRuleSnap: {}, addressSnap: {} } });
  return { c, m, shop, order, customer: asActor(c) };
}

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "Review","OrderEvent","Order","Merchant","AuditLog","Notification","RateLimitHit","User" RESTART IDENTITY CASCADE');
});

describe("reviews", () => {
  it("rates a delivered order once, notifies the shop owner, and never shows a number without reviews", async () => {
    const s = await setup();
    expect(await getShopRating(s.shop.id)).toEqual({ average: null, count: 0 });
    const o = await s.order();
    expect(await createReview(s.customer, { orderId: o.id, rating: 4, comment: "جيد" })).toEqual({ ok: true });
    expect(await createReview(s.customer, { orderId: o.id, rating: 5 })).toEqual({ ok: false, error: "ALREADY_REVIEWED" });
    expect(await getShopRating(s.shop.id)).toEqual({ average: 4, count: 1 });
    expect([...(await reviewedOrderIds(s.customer, [o.id]))]).toEqual([o.id]);
    expect(await db.notification.count({ where: { userId: s.m.id, type: "REVIEW_RECEIVED" } })).toBe(1);
    const [shown] = await listShopReviews(s.shop.id);
    expect(shown?.author).toBe("منى");
  });

  it("refuses an order that is not delivered, bad ratings and other customers", async () => {
    const s = await setup();
    const open = await s.order("PREPARING");
    expect(await createReview(s.customer, { orderId: open.id, rating: 5 })).toEqual({ ok: false, error: "NOT_DELIVERED" });
    const done = await s.order();
    expect(await createReview(s.customer, { orderId: done.id, rating: 6 })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await createReview(s.customer, { orderId: done.id, rating: 3, comment: "x".repeat(501) })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    const stranger = asActor(await user("CUSTOMER", "غريب"));
    await expect(createReview(stranger, { orderId: done.id, rating: 5 })).rejects.toThrow();
    await expect(createReview(asActor(s.m), { orderId: done.id, rating: 5 })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("a hidden review stops counting and showing; restoring brings it back; only admins with permission can", async () => {
    const s = await setup();
    const a = await s.order();
    const b = await s.order();
    await createReview(s.customer, { orderId: a.id, rating: 5 });
    await createReview(s.customer, { orderId: b.id, rating: 1 });
    expect(await getShopRating(s.shop.id)).toEqual({ average: 3, count: 2 });
    const low = await db.review.findFirstOrThrow({ where: { orderId: b.id } });
    await expect(setReviewHidden(s.customer, low.id, true)).rejects.toBeInstanceOf(AuthorizationError);
    await setReviewHidden(admin, low.id, true);
    expect(await getShopRating(s.shop.id)).toEqual({ average: 5, count: 1 });
    expect(await listShopReviews(s.shop.id)).toHaveLength(1);
    await setReviewHidden(admin, low.id, false);
    expect(await getShopRating(s.shop.id)).toEqual({ average: 3, count: 2 });
  });
});
