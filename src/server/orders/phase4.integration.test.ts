/**
 * Phase 4 integration tests against a real PostgreSQL database:  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 * STATUS: written without access to PostgreSQL or npm; NOT YET RUN. Expect to fix small typing/fixture issues on first run.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { invalidateSettingsCache } from "@/lib/settings";
import { ledgerKeys } from "@/lib/stars/rules";
import { NotFoundError } from "@/server/errors";
import { placeOrder } from "@/server/orders/checkout";
import { advanceOrder, cancelOrder, confirmPayment, decideOrder, rejectPayment, submitPayment } from "@/server/orders/lifecycle";
import { applyStarMove, getStarBalance } from "@/server/stars/ledger";
import { runDailyStarCharge, runMonthlyRewards } from "@/server/stars/jobs";

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
  await db.paymentMethodConfig.create({ data: { code: "instapay", nameAr: "انستا باي", isEnabled: true } });
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
    'TRUNCATE "ParentOrder","Order","StarLedgerEntry","StarAccount","PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","BusinessType","Category","AuditLog","User" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
  w = await world();
});

const cart = () => [{ productId: w.a.product.id, quantity: 2 }, { productId: w.b.product.id, quantity: 1 }];
const place = (key = "key-12345678") => placeOrder(w.customer, { idempotencyKey: key, addressId: w.addressId, lines: cart() });

let uploads = 0;
/** A receipt upload row as the upload service would create it (the file itself is not needed for these tests). */
async function makeUpload(orderId: string, uploaderId = w.customer.id, sha = `sha-${(uploads += 1)}`): Promise<string> {
  const row = await db.receiptUpload.create({ data: { orderId, uploaderId, storageKey: `receipts/${orderId}/${uploads}.jpg`, contentType: "image/jpeg", sizeBytes: 100, sha256: sha } });
  return row.id;
}

async function payAndConfirm(orderId: string, owner: Actor, ref = "REF-0001") {
  expect((await submitPayment(w.customer, orderId, { method: "instapay", referenceNo: ref, uploadId: await makeUpload(orderId) })).ok).toBe(true);
  expect((await confirmPayment(owner, orderId)).ok).toBe(true);
}

describe("placeOrder", () => {
  it("creates one parent and one suborder per merchant with exact money, atomically", async () => {
    const r = await place();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suborderIds.length).toBe(2);
    const parent = await db.parentOrder.findUniqueOrThrow({ where: { id: r.parentOrderId }, include: { suborders: { include: { items: true } } } });
    expect(parent.subtotalCents).toBe(13000);
    expect(parent.deliveryFeeCents).toBe(4000);
    expect(parent.totalCents).toBe(17000);
    expect(parent.suborders.reduce((s, o) => s + o.totalCents, 0)).toBe(parent.totalCents);
    const subA = parent.suborders.find((o) => o.merchantId === w.a.merchant.id)!;
    expect(subA.commissionCents).toBe(800); // 8% of 10000
    expect(subA.orderStatus).toBe("AWAITING_PAYMENT");
  });

  it("is idempotent: the same key never creates a second order", async () => {
    await place();
    const again = await place();
    expect(again.ok && again.replayed).toBe(true);
    expect(await db.parentOrder.count()).toBe(1);
    expect(await db.order.count()).toBe(2);
  });

  it("refuses a changed price and stores nothing", async () => {
    const r = await placeOrder(w.customer, { idempotencyKey: "key-aaaaaaaa", addressId: w.addressId, lines: [{ productId: w.a.product.id, quantity: 1, expectedUnitPriceCents: 4000 }] });
    expect(r).toEqual({ ok: false, error: "PRICE_CHANGED", productId: w.a.product.id });
    expect(await db.parentOrder.count()).toBe(0);
  });

  it("stays closed until the response window is configured, and needs the minimum star balance", async () => {
    await db.$executeRawUnsafe('TRUNCATE "PlatformSettingVersion"'); // settings history is append-only (DELETE is blocked by trigger)
    invalidateSettingsCache();
    expect((await place("key-bbbbbbbb"))).toEqual({ ok: false, error: "TRADING_NOT_CONFIGURED" });
    await setting("orders.merchant_response_minutes", 30);
    await setting("stars.min_balance_customer", 50);
    expect((await place("key-cccccccc"))).toEqual({ ok: false, error: "CUSTOMER_STARS_TOO_LOW" });
  });
});

describe("order lifecycle", () => {
  it("charges 2 stars to each side exactly once on approval and refunds exactly once on cancel", async () => {
    const r = await place();
    if (!r.ok) throw new Error("setup");
    const id = r.suborderIds[0]!;
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { merchant: true } });
    const owner = order.merchantId === w.a.merchant.id ? w.ownerA : w.ownerB;

    expect((await decideOrder(owner, id, "APPROVE")).ok).toBe(false); // payment not confirmed yet
    await payAndConfirm(id, owner);
    expect((await decideOrder(owner, id, "APPROVE")).ok).toBe(true);
    expect(await getStarBalance(db, w.customer.id)).toBe(18);
    expect(await getStarBalance(db, owner.id)).toBe(18);

    expect(await decideOrder(owner, id, "APPROVE")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await getStarBalance(db, w.customer.id)).toBe(18);

    expect((await cancelOrder(owner, id, "تعذر التجهيز")).ok).toBe(true);
    expect(await getStarBalance(db, w.customer.id)).toBe(20);
    expect(await getStarBalance(db, owner.id)).toBe(20);
    expect((await cancelOrder(owner, id, "مرة ثانية")).ok).toBe(false);
    expect(await getStarBalance(db, w.customer.id)).toBe(20);
    expect(await db.refund.count({ where: { orderId: id } })).toBe(1); // confirmed money must be returned
  });

  it("keeps the balance equal to the ledger", async () => {
    const r = await place();
    if (!r.ok) throw new Error("setup");
    const id = r.suborderIds[0]!;
    const owner = (await db.order.findUniqueOrThrow({ where: { id } })).merchantId === w.a.merchant.id ? w.ownerA : w.ownerB;
    await payAndConfirm(id, owner);
    await decideOrder(owner, id, "APPROVE");
    const account = await db.starAccount.findUniqueOrThrow({ where: { userId: w.customer.id } });
    const sum = await db.starLedgerEntry.aggregate({ where: { accountId: account.id }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(account.balance);
  });

  it("two simultaneous approvals charge only once", async () => {
    const r = await place();
    if (!r.ok) throw new Error("setup");
    const id = r.suborderIds[0]!;
    const owner = (await db.order.findUniqueOrThrow({ where: { id } })).merchantId === w.a.merchant.id ? w.ownerA : w.ownerB;
    await payAndConfirm(id, owner);
    const results = await Promise.all([decideOrder(owner, id, "APPROVE"), decideOrder(owner, id, "APPROVE")]);
    expect(results.filter((x) => x.ok).length).toBe(1);
    expect(await getStarBalance(db, w.customer.id)).toBe(18);
    expect(await db.starLedgerEntry.count({ where: { orderId: id, reason: "ORDER_CHARGE" } })).toBe(2);
  });

  it("does not approve when a side cannot afford it, and changes nothing", async () => {
    const r = await place();
    if (!r.ok) throw new Error("setup");
    const id = r.suborderIds[0]!;
    const owner = (await db.order.findUniqueOrThrow({ where: { id } })).merchantId === w.a.merchant.id ? w.ownerA : w.ownerB;
    await payAndConfirm(id, owner);
    await giveStars(owner.id, -17, `drain:${owner.id}`); // leaves 3, below the minimum of 5
    expect(await decideOrder(owner, id, "APPROVE")).toEqual({ ok: false, error: "INSUFFICIENT_STARS" });
    expect((await db.order.findUniqueOrThrow({ where: { id } })).orderStatus).toBe("AWAITING_MERCHANT_APPROVAL");
    expect(await getStarBalance(db, w.customer.id)).toBe(20);
  });

  it("blocks the same transfer reference from being confirmed twice", async () => {
    const r = await place();
    if (!r.ok) throw new Error("setup");
    const [first, second] = r.suborderIds as [string, string];
    const ownerOf = async (id: string) => ((await db.order.findUniqueOrThrow({ where: { id } })).merchantId === w.a.merchant.id ? w.ownerA : w.ownerB);
    await payAndConfirm(first, await ownerOf(first), "SAME-REF-1");
    await submitPayment(w.customer, second, { method: "instapay", referenceNo: "SAME-REF-1", uploadId: await makeUpload(second) });
    expect(await confirmPayment(await ownerOf(second), second)).toEqual({ ok: false, error: "DUPLICATE_TRANSFER" });
  });

  it("hides other people's orders (IDOR) and rejects disabled methods", async () => {
    const r = await place();
    if (!r.ok) throw new Error("setup");
    const id = r.suborderIds[0]!;
    const owner = (await db.order.findUniqueOrThrow({ where: { id } })).merchantId === w.a.merchant.id ? w.ownerA : w.ownerB;
    const other = owner.id === w.ownerA.id ? w.ownerB : w.ownerA;
    const stranger = await user("CUSTOMER");
    await expect(submitPayment(stranger, id, { method: "instapay", referenceNo: "REF-9999", uploadId: await makeUpload(id) })).rejects.toBeInstanceOf(NotFoundError);
    await submitPayment(w.customer, id, { method: "instapay", referenceNo: "REF-9999", uploadId: await makeUpload(id) });
    await expect(confirmPayment(other, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(advanceOrder(other, id, "PREPARING")).rejects.toBeInstanceOf(NotFoundError);
    await db.paymentMethodConfig.update({ where: { code: "instapay" }, data: { isEnabled: false } });
    expect(await rejectPayment(owner, id, "لم يصل التحويل")).toEqual({ ok: true });
    expect(await submitPayment(w.customer, id, { method: "instapay", referenceNo: "REF-8888", uploadId: await makeUpload(id) })).toEqual({ ok: false, error: "PAYMENT_METHOD_DISABLED" });
  });
});

describe("receipt proof", () => {
  it("accepts only the customer's own unused upload for that order, and flags a reused picture", async () => {
    const r = await place();
    if (!r.ok) throw new Error("setup");
    const [first, second] = r.suborderIds as [string, string];
    const pay = (orderId: string, uploadId: string, ref: string) => submitPayment(w.customer, orderId, { method: "instapay", referenceNo: ref, uploadId });

    const other = await makeUpload(second);
    expect(await pay(first, other, "REF-A001")).toEqual({ ok: false, error: "INVALID_REQUEST" }); // upload belongs to another order
    expect(await pay(first, "nonexistent-id", "REF-A002")).toEqual({ ok: false, error: "INVALID_REQUEST" });

    const mine = await makeUpload(first, w.customer.id, "same-picture");
    expect((await pay(first, mine, "REF-A003")).ok).toBe(true);
    expect(await pay(first, mine, "REF-A004")).toEqual({ ok: false, error: "WRONG_STATE" }); // already awaiting confirmation

    expect((await pay(second, await makeUpload(second, w.customer.id, "same-picture"), "REF-A005")).ok).toBe(true);
    const flagged = await db.payment.findFirstOrThrow({ where: { orderId: second } });
    expect(flagged.flagged).toBe(true);
    expect(flagged.flagReason).toContain("image");
    expect((await db.receiptUpload.findUniqueOrThrow({ where: { id: mine } })).usedAt).not.toBeNull();
  });
});

describe("star ledger", () => {
  it("never goes negative and ignores a repeated idempotency key", async () => {
    const key = ledgerKeys.daily(w.customer.id, "2026-10-29");
    const first = await db.$transaction((tx) => applyStarMove(tx, { userId: w.customer.id, amount: -1, reason: "ADMIN_CORRECTION", idempotencyKey: key }));
    const second = await db.$transaction((tx) => applyStarMove(tx, { userId: w.customer.id, amount: -1, reason: "ADMIN_CORRECTION", idempotencyKey: key }));
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(await getStarBalance(db, w.customer.id)).toBe(19);
    await expect(db.$transaction((tx) => applyStarMove(tx, { userId: w.customer.id, amount: -500, reason: "ADMIN_CORRECTION", idempotencyKey: "big" }))).rejects.toThrow();
    expect(await getStarBalance(db, w.customer.id)).toBe(19);
  });
});

describe("scheduled star jobs", () => {
  it("charges one star per active account per Cairo day, never twice, never below zero, never admins", async () => {
    const admin = await db.user.create({ data: { phone: "+201000000099", name: "Admin", passwordHash: "x", role: "ADMIN", status: "ACTIVE" } });
    await giveStars(admin.id, 10, "seed:admin");
    const now = new Date();
    await runDailyStarCharge(now);
    await runDailyStarCharge(now); // re-run the same day
    expect(await getStarBalance(db, w.customer.id)).toBe(19);
    expect(await getStarBalance(db, w.ownerA.id)).toBe(19);
    expect(await getStarBalance(db, admin.id)).toBe(10);
    await giveStars(w.customer.id, -19, "drain:c");
    const summary = await runDailyStarCharge(new Date(now.getTime() + 86_400_000));
    expect(summary.failed).toBe(0);
    expect(await getStarBalance(db, w.customer.id)).toBe(0); // zero balance is skipped: no debt
  });

  it("grants each monthly reward tier once, only for delivered suborders", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await placeOrder(w.customer, { idempotencyKey: `reward-key-${i}-abc`, addressId: w.addressId, lines: [{ productId: w.a.product.id, quantity: 1 }] });
      if (!r.ok) throw new Error("setup");
      await db.orderEvent.create({ data: { orderId: r.suborderIds[0]!, field: "orderStatus", toValue: "DELIVERED" } });
    }
    const before = await getStarBalance(db, w.customer.id);
    await runMonthlyRewards();
    await runMonthlyRewards();
    expect(await getStarBalance(db, w.customer.id)).toBe(before + 15);
    expect(await db.starLedgerEntry.count({ where: { reason: "MONTHLY_REWARD" } })).toBe(1);
  });
});
