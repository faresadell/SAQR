/**
 * Offer discounts at checkout and the contest standings (real PostgreSQL).
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { AuthorizationError } from "@/server/errors";
import { excludeParticipant, getStandings, proposeFromStandings, restoreParticipant } from "@/server/contest/service";
import { approveLegalPage } from "@/server/legal/service";
import { createOffer, listPublicOffers, stopOffer } from "@/server/offers/service";
import { placeOrder } from "@/server/orders/checkout";
import { applyStarMove } from "@/server/stars/ledger";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const past = new Date(Date.now() - 86_400_000);
const superAdmin: Actor = { id: "sa", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const limited: Actor = { id: "lim", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };
let n = 0;

async function user(role: "CUSTOMER" | "MERCHANT"): Promise<Actor> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2012${String(n).padStart(8, "0")}`, name: `U${n}`, passwordHash: "x", role, status: "ACTIVE" } });
  return { id: u.id, role, isSuperAdmin: false, permissions: [] };
}
async function setting(key: string, value: number) {
  await db.platformSettingVersion.create({ data: { key, value: { v: value }, effectiveFrom: past, createdById: "test" } });
  invalidateSettingsCache();
}
async function stars(userId: string, amount: number) {
  await db.$transaction((tx) => applyStarMove(tx, { userId, amount, reason: "PURCHASE", idempotencyKey: `seed:${userId}` }));
}

let customer: Actor;
let owner: Actor;
let shopId: string;
let addressId: string;
let p1: { id: string };
let p2: { id: string };

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "OfferProduct","Offer","ContestAward","ContestExclusion","ParentOrder","Order","StarLedgerEntry","StarAccount","PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","BusinessType","Category","AuditLog","Notification","User" RESTART IDENTITY CASCADE',
  );
  await db.$executeRawUnsafe(`UPDATE "LegalPage" SET "version" = 1, "approvedAt" = NULL, "approvedById" = NULL`);
  invalidateSettingsCache();
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
  const category = await db.category.create({ data: { nameAr: "عام" } });
  await db.commissionRate.createMany({ data: [{ tier: "REGULAR", basisPoints: 800, effectiveFrom: past, createdById: "t" }, { tier: "BUSINESS", basisPoints: 500, effectiveFrom: past, createdById: "t" }] });
  await setting("orders.merchant_response_minutes", 30);
  const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
  await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "t" } });
  customer = await user("CUSTOMER");
  owner = await user("MERCHANT");
  await stars(customer.id, 20);
  await stars(owner.id, 20);
  addressId = (await db.address.create({ data: { userId: customer.id, line: "شارع 9", zoneId: zone.id } })).id;
  const shop = await db.merchant.create({ data: { ownerId: owner.id, name: "متجر", businessType: "restaurant", status: "APPROVED" } });
  shopId = shop.id;
  p1 = await db.product.create({ data: { merchantId: shop.id, categoryId: category.id, nameAr: "منتج 1", priceCents: 10_000 } });
  p2 = await db.product.create({ data: { merchantId: shop.id, categoryId: category.id, nameAr: "منتج 2", priceCents: 4_000 } });
});

describe("offer discounts", () => {
  it("are refused until an administrator switches them on, and plain announcement offers still work", async () => {
    expect(await createOffer(owner, { title: "خصم كبير", discount: { type: "PERCENT", value: 1000 }, productIds: [p1.id] })).toEqual({ ok: false, error: "DISCOUNTS_DISABLED" });
    expect((await createOffer(owner, { title: "عرض إعلاني" })).ok).toBe(true);
    expect(await createOffer(owner, { title: "منتجات بلا خصم", productIds: [p1.id] })).toEqual({ ok: false, error: "INVALID_REQUEST" });
  });

  it("validates limits, ownership, final price and overlap, then applies at checkout with a full price snapshot", async () => {
    await setting("offers.discount.enabled", 1);
    await setting("offers.discount.max_percent", 30);
    await setting("offers.discount.max_active_per_shop", 2);
    expect(await createOffer(owner, { title: "خصم كبير", discount: { type: "PERCENT", value: 3100 }, productIds: [p1.id] })).toEqual({ ok: false, error: "DISCOUNT_ABOVE_LIMIT" });
    expect(await createOffer(owner, { title: "خصم ثابت", discount: { type: "FIXED", value: 4_000 }, productIds: [p2.id] })).toEqual({ ok: false, error: "FINAL_PRICE_NOT_POSITIVE" });
    expect(await createOffer(owner, { title: "خصم صفر", discount: { type: "FIXED", value: 0 }, productIds: [p2.id] })).toEqual({ ok: false, error: "DISCOUNT_INVALID" });
    const other = await user("MERCHANT");
    const strangerShop = await db.merchant.create({ data: { ownerId: other.id, name: "غريب", businessType: "restaurant", status: "APPROVED" } });
    const foreign = await db.product.create({ data: { merchantId: strangerShop.id, categoryId: (await db.category.findFirstOrThrow()).id, nameAr: "x", priceCents: 1000 } });
    expect(await createOffer(owner, { title: "منتج غيري", discount: { type: "PERCENT", value: 1000 }, productIds: [foreign.id] })).toEqual({ ok: false, error: "INVALID_REQUEST" });

    const created = await createOffer(owner, { title: "خصم 15%", discount: { type: "PERCENT", value: 1500 }, productIds: [p1.id] });
    expect(created.ok).toBe(true);
    expect(await createOffer(owner, { title: "نفس المنتج", discount: { type: "FIXED", value: 100 }, productIds: [p1.id] })).toEqual({ ok: false, error: "PRODUCT_ALREADY_IN_OFFER" });
    expect((await createOffer(owner, { title: "خصم ثابت", discount: { type: "FIXED", value: 500 }, productIds: [p2.id] })).ok).toBe(true);
    expect(await createOffer(owner, { title: "ثالث", discount: { type: "FIXED", value: 100 }, productIds: [p1.id, p2.id] })).toEqual({ ok: false, error: "TOO_MANY_DISCOUNTED_OFFERS" });

    const pub = (await listPublicOffers()).find((o) => o.title === "خصم 15%")!;
    expect(pub.products[0]).toMatchObject({ priceCents: 10_000, finalPriceCents: 8_500 });

    // the customer saw the OLD price: refused, never silently repriced
    const stale = await placeOrder(customer, { idempotencyKey: "key-stale-0001", addressId, lines: [{ productId: p1.id, quantity: 1, expectedUnitPriceCents: 10_000 }] });
    expect(stale).toMatchObject({ ok: false, error: "PRICE_CHANGED" });

    const placed = await placeOrder(customer, { idempotencyKey: "key-offer-0001", addressId, lines: [{ productId: p1.id, quantity: 2, expectedUnitPriceCents: 8_500 }, { productId: p2.id, quantity: 1, expectedUnitPriceCents: 3_500 }] });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const order = await db.order.findFirstOrThrow({ where: { parentOrderId: placed.parentOrderId }, include: { items: true } });
    const i1 = order.items.find((i) => i.productId === p1.id)!;
    expect(i1).toMatchObject({ unitPriceCents: 10_000, unitDiscountCents: 1_500, discountCents: 3_000, lineTotalCents: 17_000, offerId: created.ok ? created.offerId : "" });
    expect(order.items.find((i) => i.productId === p2.id)).toMatchObject({ unitPriceCents: 4_000, unitDiscountCents: 500, lineTotalCents: 3_500 });
    expect(order.subtotalCents).toBe(20_500); // product value after discount
    expect(order.commissionBaseCents).toBe(20_500); // commission only on the discounted product value, never delivery
    expect(order.commissionCents).toBe(1_640); // 8% of 20500
    expect(order.totalCents).toBe(22_500);

    // a later price change does not touch the stored snapshot
    await db.product.update({ where: { id: p1.id }, data: { priceCents: 12_000 } });
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: i1.id } })).unitPriceCents).toBe(10_000);
  });

  it("stops applying when the offer is stopped, expires, or discounts are switched off; the database refuses bad item math", async () => {
    await setting("offers.discount.enabled", 1);
    const created = await createOffer(owner, { title: "خصم 10%", discount: { type: "PERCENT", value: 1000 }, productIds: [p1.id] });
    if (!created.ok) throw new Error("setup");
    const price = async (key: string) => {
      const r = await placeOrder(customer, { idempotencyKey: key, addressId, lines: [{ productId: p1.id, quantity: 1 }] });
      if (!r.ok) throw new Error(r.error);
      return (await db.orderItem.findFirstOrThrow({ where: { order: { parentOrderId: r.parentOrderId } } })).lineTotalCents;
    };
    expect(await price("key-price-0001")).toBe(9_000);
    await setting("offers.discount.enabled", 0);
    expect(await price("key-price-0002")).toBe(10_000);
    await setting("offers.discount.enabled", 1);
    await db.offer.update({ where: { id: created.offerId }, data: { startsAt: new Date(Date.now() - 7_200_000), endsAt: new Date(Date.now() - 1000) } });
    expect(await price("key-price-0003")).toBe(10_000);
    await db.offer.update({ where: { id: created.offerId }, data: { endsAt: new Date(Date.now() + 3_600_000) } });
    expect(await price("key-price-0004")).toBe(9_000);
    expect((await stopOffer(owner, created.offerId)).ok).toBe(true);
    expect(await price("key-price-0005")).toBe(10_000);
    // a price drop that would make a FIXED discount non-positive: sold at the normal price, never free
    await db.offer.create({ data: { merchantId: shopId, title: "ثابت", startsAt: past, endsAt: new Date(Date.now() + 3_600_000), discountType: "FIXED", discountValue: 4_000, products: { create: [{ productId: p2.id }] } } });
    await db.product.update({ where: { id: p2.id }, data: { priceCents: 3_000 } });
    const r = await placeOrder(customer, { idempotencyKey: "key-price-0006", addressId, lines: [{ productId: p2.id, quantity: 1 }] });
    if (!r.ok) throw new Error(r.error);
    expect((await db.orderItem.findFirstOrThrow({ where: { order: { parentOrderId: r.parentOrderId } } })).lineTotalCents).toBe(3_000);
    await expect(db.$executeRawUnsafe(`UPDATE "OrderItem" SET "unitDiscountCents" = 3000, "discountCents" = 3000 WHERE "productId" = '${p2.id}'`)).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`UPDATE "Offer" SET "discountValue" = 9500 WHERE "id" = '${created.offerId}'`)).rejects.toThrow();
  });
});

describe("contest standings", () => {
  async function delivered(customerId: string, merchantId: string, base: number, at: Date, extra: { refunded?: number } = {}) {
    const order = await db.order.create({ data: { customerId, merchantId, subtotalCents: base, deliveryFeeCents: 2_000, totalCents: base + 2_000, merchantTierSnap: "REGULAR", commissionBp: 800, commissionBaseCents: base, commissionCents: Math.floor(base * 0.08), deliveryRuleSnap: {}, addressSnap: {} } });
    await db.orderEvent.create({ data: { orderId: order.id, field: "orderStatus", toValue: "DELIVERED", createdAt: at } });
    if (extra.refunded) await db.refund.create({ data: { orderId: order.id, amountCents: extra.refunded, status: "COMPLETED", dueAt: at } });
    return order.id;
  }
  const sept = (d: number) => new Date(`2026-09-${String(d).padStart(2, "0")}T12:00:00Z`);

  it("ranks real delivered orders: count, then sales, then who got there first; excluded and self orders do not count", async () => {
    const [a, b, c, selfBuyer] = [await user("CUSTOMER"), await user("CUSTOMER"), await user("CUSTOMER"), owner];
    await delivered(a.id, shopId, 10_000, sept(2));
    await delivered(a.id, shopId, 10_000, sept(3));
    await delivered(b.id, shopId, 20_000, sept(4));
    await delivered(b.id, shopId, 5_000, sept(5));
    await delivered(c.id, shopId, 10_000, sept(6));
    await delivered(c.id, shopId, 12_000, sept(7), { refunded: 14_000 }); // fully refunded: not counted
    await delivered(selfBuyer.id, shopId, 99_000, sept(8)); // the shop owner ordering from their own shop
    await delivered(c.id, shopId, 7_000, new Date("2026-10-01T12:00:00Z")); // another month
    await expect(getStandings(limited, "2026-09")).rejects.toBeInstanceOf(AuthorizationError);
    const view = (await getStandings(superAdmin, "2026-09", 20, new Date("2026-10-31T12:00:00Z")))!;
    expect(view.closed).toBe(true);
    expect(view.standings.map((s) => [s.userId, s.qualifyingOrders, s.qualifyingSalesCents])).toEqual([[b.id, 2, 25_000], [a.id, 2, 20_000], [c.id, 1, 10_000]]);
    expect(await getStandings(superAdmin, "2026-13")).toBeNull();
    expect(await excludeParticipant(superAdmin, "2026-09", b.id, "x")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await excludeParticipant(superAdmin, "2026-09", b.id, "تلاعب مثبت بطلبات وهمية")).ok).toBe(true);
    expect((await getStandings(superAdmin, "2026-09"))!.standings.map((s) => s.userId)).toEqual([a.id, c.id]);
    expect((await restoreParticipant(superAdmin, "2026-09", b.id)).ok).toBe(true);
    expect(await restoreParticipant(superAdmin, "2026-09", b.id)).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await db.auditLog.count({ where: { action: { in: ["CONTEST_PARTICIPANT_EXCLUDED", "CONTEST_PARTICIPANT_RESTORED"] } } })).toBe(2);
  });

  it("proposes awards only for a closed month, with the contest enabled and the rules page approved, once", async () => {
    const [a, b] = [await user("CUSTOMER"), await user("CUSTOMER")];
    await delivered(a.id, shopId, 10_000, sept(2));
    await delivered(a.id, shopId, 10_000, sept(3));
    await delivered(b.id, shopId, 10_000, sept(4));
    const after = new Date("2026-10-31T12:00:00Z");
    expect(await proposeFromStandings(superAdmin, "2026-09", new Date("2026-09-20T00:00:00Z"))).toEqual({ ok: false, error: "MONTH_NOT_CLOSED" });
    expect(await proposeFromStandings(superAdmin, "2026-09", after)).toEqual({ ok: false, error: "CONTEST_NOT_ENABLED" });
    await setting("contest.enabled", 1);
    expect(await proposeFromStandings(superAdmin, "2026-09", after)).toEqual({ ok: false, error: "RULES_NOT_APPROVED" });
    expect((await approveLegalPage(superAdmin, "contest", 1)).ok).toBe(true);
    expect(await proposeFromStandings(superAdmin, "2026-08", after)).toEqual({ ok: false, error: "NOT_ENOUGH_PARTICIPANTS" });
    const r = await proposeFromStandings(superAdmin, "2026-09", after);
    expect(r.ok && r.awardIds.length).toBe(2);
    const awards = await db.contestAward.findMany({ where: { monthKey: "2026-09" }, orderBy: { rank: "asc" } });
    expect(awards.map((x) => [x.rank, x.userId, x.prizeCents, x.status])).toEqual([[1, a.id, 100_000, "PROPOSED"], [2, b.id, 50_000, "PROPOSED"]]);
    expect(await proposeFromStandings(superAdmin, "2026-09", after)).toEqual({ ok: false, error: "AWARDS_EXIST" });
  });
});
