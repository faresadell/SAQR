/**
 * Coupon integration tests against a real PostgreSQL database:  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { accountForOrder, giveAccount, grantPackage } from "@/test-support/package";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { placeOrder } from "@/server/orders/checkout";
import { submitPayment } from "@/server/orders/lifecycle";
import { createCoupon, listCoupons, setCouponActive } from "@/server/coupons/service";
import { applyStarMove } from "@/server/stars/ledger";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const past = new Date(Date.now() - 86_400_000);
let n = 0;

async function user(role: "CUSTOMER" | "MERCHANT"): Promise<Actor> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2011${String(n).padStart(8, "0")}`, name: `U${n}`, passwordHash: "x", role, status: "ACTIVE" } });
  return { id: u.id, role, isSuperAdmin: false, permissions: [] };
}

async function giveStars(userId: string, amount: number, key: string) {
  await db.$transaction((tx) => applyStarMove(tx, { userId, amount, reason: "PURCHASE", idempotencyKey: key }));
}

async function shop(owner: Actor, name: string, price: number) {
  const m = await db.merchant.create({ data: { ownerId: owner.id, name, businessType: "restaurant", status: "APPROVED" } });
  await grantPackage(owner.id);
  await giveAccount(m.id);
  const category = await db.category.findFirstOrThrow();
  const p = await db.product.create({ data: { merchantId: m.id, categoryId: category.id, nameAr: `منتج ${name}`, priceCents: price } });
  return { merchant: m, product: p };
}

async function setting(key: string, value: number) {
  await db.platformSettingVersion.create({ data: { key, value: { v: value }, effectiveFrom: past, createdById: "test" } });
  invalidateSettingsCache();
}

interface World {
  customer: Actor;
  ownerA: Actor;
  ownerB: Actor;
  a: Awaited<ReturnType<typeof shop>>;
  b: Awaited<ReturnType<typeof shop>>;
  addressId: string;
}

async function world(): Promise<World> {
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
  await db.category.create({ data: { nameAr: "عام" } });
  await db.commissionRate.createMany({ data: [{ tier: "REGULAR", basisPoints: 800, effectiveFrom: past, createdById: "t" }, { tier: "BUSINESS", basisPoints: 500, effectiveFrom: past, createdById: "t" }] });
  await db.paymentMethodConfig.create({ data: { code: "instapay", nameAr: "انستا باي", isEnabled: true, receiverNumber: "01000000000" } });
  await setting("orders.merchant_response_minutes", 30);
  const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
  await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "t" } });
  const customer = await user("CUSTOMER");
  const ownerA = await user("MERCHANT");
  const ownerB = await user("MERCHANT");
  const address = await db.address.create({ data: { userId: customer.id, line: "شارع 9", zoneId: zone.id } });
  for (const [u, k] of [[customer, "c"], [ownerA, "a"], [ownerB, "b"]] as const) await giveStars(u.id, 20, `seed:${k}:${u.id}`);
  return { customer, ownerA, ownerB, a: await shop(ownerA, "A", 5000), b: await shop(ownerB, "B", 3000), addressId: address.id };
}

let w: World;
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Coupon","ParentOrder","Order","StarLedgerEntry","StarAccount","PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","BusinessType","Category","AuditLog","Notification","ReceiptUpload","User" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
  w = await world();
});

const cart = () => [{ productId: w.a.product.id, quantity: 2 }, { productId: w.b.product.id, quantity: 1 }]; // A: 100.00, B: 30.00
const tomorrow = new Date(Date.now() + 86_400_000);
const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const place = (couponCode?: string, key = "key-12345678") => placeOrder(w.customer, { idempotencyKey: key, addressId: w.addressId, lines: cart(), ...(couponCode ? { couponCode } : {}) });

describe("coupons", () => {
  it("validates input, keeps codes unique and keeps each shop to its own coupons", async () => {
    expect(await createCoupon(w.ownerA, { code: "ab", kind: "PERCENT", value: 10, expiresAt: tomorrow })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await createCoupon(w.ownerA, { code: "SAVE10", kind: "PERCENT", value: 31, expiresAt: tomorrow })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await createCoupon(w.ownerA, { code: "SAVE10", kind: "FIXED", value: 10_001, expiresAt: tomorrow })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await createCoupon(w.ownerA, { code: "SAVE10", kind: "PERCENT", value: 10, expiresAt: past })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    const made = await createCoupon(w.ownerA, { code: " save10 ", kind: "PERCENT", value: 10, expiresAt: tomorrow });
    expect(made.ok).toBe(true);
    expect(await createCoupon(w.ownerB, { code: "SAVE10", kind: "PERCENT", value: 5, expiresAt: tomorrow })).toEqual({ ok: false, error: "CODE_TAKEN" });
    await expect(createCoupon(w.customer, { code: "HACK1234", kind: "PERCENT", value: 10, expiresAt: tomorrow })).rejects.toBeInstanceOf(AuthorizationError);
    if (!made.ok) throw new Error("setup");
    await expect(setCouponActive(w.ownerB, made.couponId, false)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listCoupons(w.ownerB)).length).toBe(0);
    expect((await listCoupons(w.ownerA)).length).toBe(1);
  });

  it("a shop coupon takes money off that shop's products only; the total and the payment amount follow", async () => {
    await createCoupon(w.ownerA, { code: "A10", kind: "PERCENT", value: 10, expiresAt: tomorrow });
    const r = await place("a10");
    if (!r.ok) throw new Error(r.error);
    const [oa, ob] = await Promise.all([
      db.order.findFirstOrThrow({ where: { merchantId: w.a.merchant.id } }),
      db.order.findFirstOrThrow({ where: { merchantId: w.b.merchant.id } }),
    ]);
    expect([oa.subtotalCents, oa.discountCents, oa.totalCents, oa.couponCode, oa.couponFundedBy]).toEqual([10_000, 1_000, 11_000, "A10", "MERCHANT"]);
    expect([ob.discountCents, ob.couponCode, ob.totalCents]).toEqual([0, null, 5_000]);
    const parent = await db.parentOrder.findUniqueOrThrow({ where: { id: r.parentOrderId } });
    expect([parent.discountCents, parent.totalCents]).toEqual([1_000, 16_000]);

    expect((await submitPayment(w.customer, oa.id, { accountId: await accountForOrder(oa.id), referenceNo: "REF-1", uploadId: await upload(oa.id) })).ok).toBe(true);
    expect((await db.payment.findFirstOrThrow({ where: { orderId: oa.id } })).amountCents).toBe(9_000); // products minus coupon; delivery is cash
    const mine = (await listCoupons(w.ownerA))[0]!;
    expect([mine.uses, mine.discountCents]).toEqual([1, 1_000]);
  });

  it("a platform coupon fixed amount is shared across shops and adds up exactly", async () => {
    await createCoupon(admin, { code: "PLAT10", kind: "FIXED", value: 1_000, expiresAt: tomorrow });
    const r = await place("PLAT10");
    if (!r.ok) throw new Error(r.error);
    const rows = await db.order.findMany({ where: { parentOrderId: r.parentOrderId }, select: { merchantId: true, discountCents: true, couponFundedBy: true } });
    expect(rows.reduce((n, o) => n + o.discountCents, 0)).toBe(1_000);
    expect(rows.every((o) => o.couponFundedBy === "PLATFORM")).toBe(true);
    expect(rows.find((o) => o.merchantId === w.a.merchant.id)!.discountCents).toBeGreaterThan(rows.find((o) => o.merchantId === w.b.merchant.id)!.discountCents);
  });

  it("refuses unknown, stopped, expired and wrong-shop codes without creating an order", async () => {
    await createCoupon(w.ownerA, { code: "STOPME1", kind: "PERCENT", value: 10, expiresAt: tomorrow });
    const stopped = await db.coupon.findFirstOrThrow({ where: { code: "STOPME1" } });
    await setCouponActive(w.ownerA, stopped.id, false);
    await db.coupon.create({ data: { code: "OLDONE1", kind: "PERCENT", value: 10, merchantId: null, expiresAt: past, createdById: "t" } });
    const onlyB = { productId: w.b.product.id, quantity: 1 };
    await createCoupon(w.ownerA, { code: "ONLYA1", kind: "PERCENT", value: 10, expiresAt: tomorrow });

    expect(await place("NOPE1234")).toMatchObject({ ok: false, error: "COUPON_INVALID" });
    expect(await place("STOPME1")).toMatchObject({ ok: false, error: "COUPON_INVALID" });
    expect(await place("OLDONE1")).toMatchObject({ ok: false, error: "COUPON_EXPIRED" });
    expect(await placeOrder(w.customer, { idempotencyKey: "key-onlyb-123", addressId: w.addressId, lines: [onlyB], couponCode: "ONLYA1" })).toMatchObject({ ok: false, error: "COUPON_NOT_FOR_CART" });
    expect(await db.order.count()).toBe(0);
  });
});

let uploads = 0;
async function upload(orderId: string): Promise<string> {
  uploads += 1;
  return (await db.receiptUpload.create({ data: { orderId, uploaderId: w.customer.id, storageKey: `receipts/${orderId}/${uploads}.jpg`, contentType: "image/jpeg", sizeBytes: 100, sha256: `sha-c-${uploads}` } })).id;
}
