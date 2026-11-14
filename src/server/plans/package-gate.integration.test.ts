/**
 * Package gate and star top-up integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { DEFAULT_PLANS } from "@/lib/stars/rules";
import { createOffer, createOfferAsAdmin } from "@/server/offers/service";
import { decidePlanPurchase, hasEverHadPackage, listAllPlans, requestPlanPurchase, requestStarTopUp, shopHasPackage } from "@/server/plans/service";
import { applyStarMove, getStarBalance } from "@/server/stars/ledger";
import { AuthorizationError } from "@/server/errors";
import { grantPackage } from "@/test-support/package";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
let n = 0;
let uploads = 0;

async function merchant(): Promise<{ actor: Actor; shopId: string }> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2014${String(n).padStart(8, "0")}`, name: `M${n}`, passwordHash: "x", role: "MERCHANT", status: "ACTIVE" } });
  const shop = await db.merchant.create({ data: { ownerId: u.id, name: `shop ${n}`, businessType: "restaurant", status: "APPROVED" } });
  return { actor: { id: u.id, role: "MERCHANT", isSuperAdmin: false, permissions: [] }, shopId: shop.id };
}
async function upload(owner: Actor): Promise<string> {
  uploads += 1;
  return (await db.receiptUpload.create({ data: { orderId: null, uploaderId: owner.id, storageKey: `receipts/gate${owner.id}/${uploads}.jpg`, contentType: "image/jpeg", sizeBytes: 10, sha256: `g${uploads}` } })).id;
}
let ref = 0;
const topUp = async (who: Actor, stars: number) => requestStarTopUp(who, { stars, method: "instapay", referenceNo: `TOPUP-REF-${(ref += 1)}`, uploadId: await upload(who) });

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "PlanPurchase","Subscription","Plan","ReceiptUpload","StarLedgerEntry","StarAccount","PaymentMethodConfig","Offer","Merchant","AuditLog","Notification","User" RESTART IDENTITY CASCADE');
  await db.paymentMethodConfig.create({ data: { code: "instapay", nameAr: "انستا باي", isEnabled: true, receiverNumber: "01000000000" } });
  for (const [i, p] of DEFAULT_PLANS.entries()) await db.plan.create({ data: { ...p, nameAr: p.code, sortOrder: i } });
});

describe("package gate", () => {
  it("a shop that never bought a package cannot publish offers (an admin still can on its behalf)", async () => {
    const m = await merchant();
    expect(await hasEverHadPackage(m.actor.id)).toBe(false);
    expect(await shopHasPackage(m.shopId)).toBe(false);
    expect(await createOffer(m.actor, { title: "عرض بدون باقة" })).toEqual({ ok: false, error: "NO_PACKAGE" });
    expect((await createOfferAsAdmin(admin, m.shopId, { title: "عرض من الإدارة" })).ok).toBe(true);
    await grantPackage(m.actor.id);
    expect(await shopHasPackage(m.shopId)).toBe(true);
    expect((await createOffer(m.actor, { title: "عرض بعد الباقة" })).ok).toBe(true);
  });

  it("an ended package still counts as having had one", async () => {
    const m = await merchant();
    await grantPackage(m.actor.id);
    await db.subscription.update({ where: { userId: m.actor.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await hasEverHadPackage(m.actor.id)).toBe(true);
  });
});

describe("star top-up", () => {
  it("needs a first package; then any number of stars at 1 EGP each, reviewed by an admin, never touching the package", async () => {
    const m = await merchant();
    expect(await topUp(m.actor, 40)).toEqual({ ok: false, error: "NO_PACKAGE" });

    await grantPackage(m.actor.id);
    const expiredAt = new Date(Date.now() - 86_400_000);
    await db.subscription.update({ where: { userId: m.actor.id }, data: { expiresAt: expiredAt } });
    const r = await topUp(m.actor, 40);
    if (!r.ok) throw new Error(`setup ${r.error}`);
    const purchase = await db.planPurchase.findUniqueOrThrow({ where: { id: r.purchaseId } });
    expect([purchase.priceCentsSnap, purchase.baseStarsSnap, purchase.bonusStarsSnap]).toEqual([4000, 40, 0]);
    expect(await getStarBalance(db, m.actor.id)).toBe(0); // nothing before approval

    expect((await decidePlanPurchase(admin, r.purchaseId, "APPROVE")).ok).toBe(true);
    expect(await getStarBalance(db, m.actor.id)).toBe(40);
    const sub = await db.subscription.findUniqueOrThrow({ where: { userId: m.actor.id } });
    expect(sub.expiresAt.getTime()).toBe(expiredAt.getTime()); // package NOT extended
    expect(await decidePlanPurchase(admin, r.purchaseId, "APPROVE")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await getStarBalance(db, m.actor.id)).toBe(40);
  });

  it("validates the amount, is merchant-only, hides the internal plan, and a rejected top-up grants nothing", async () => {
    const m = await merchant();
    await grantPackage(m.actor.id);
    for (const bad of [0, -5, 1.5, 5001, Number.NaN]) expect(await topUp(m.actor, bad)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    const customer = await db.user.create({ data: { phone: "+201400000999", name: "C", passwordHash: "x", role: "CUSTOMER", status: "ACTIVE" } });
    await expect(requestStarTopUp({ id: customer.id, role: "CUSTOMER", isSuperAdmin: false, permissions: [] }, { stars: 10, method: "instapay", referenceNo: "X-REF-1", uploadId: "u".repeat(10) })).rejects.toBeInstanceOf(AuthorizationError);

    const r = await topUp(m.actor, 10);
    if (!r.ok) throw new Error("setup");
    expect(await topUp(m.actor, 10)).toEqual({ ok: false, error: "PURCHASE_PENDING" });
    expect((await decidePlanPurchase(admin, r.purchaseId, "REJECT", "التحويل غير واضح")).ok).toBe(true);
    expect(await getStarBalance(db, m.actor.id)).toBe(0);

    expect((await listAllPlans(admin)).some((p) => p.code === "merchant_stars_topup")).toBe(false);
    expect(await requestPlanPurchase(m.actor, { planCode: "merchant_stars_topup", method: "instapay", referenceNo: "SNEAK-REF-1", uploadId: await upload(m.actor) })).toEqual({ ok: false, error: "PLAN_NOT_AVAILABLE" });
  });
});

describe("offer quota and paid hours", () => {
  const withQuota = async (m: { actor: Actor }, code = "merchant_stars_100") => {
    const plan = await db.plan.findUniqueOrThrow({ where: { code } });
    const now = new Date();
    await db.subscription.create({ data: { userId: m.actor.id, planId: plan.id, startsAt: now, expiresAt: new Date(now.getTime() + 30 * 86_400_000) } });
  };
  const fund = (userId: string, amount: number) => db.$transaction((tx) => applyStarMove(tx, { userId, amount, reason: "PURCHASE", idempotencyKey: `fund:${userId}:${amount}` }));

  it("the first 4 offers of a 100+15 package are free; the 5th needs hours and costs 1 star per hour; stopped offers still count", async () => {
    const m = await merchant();
    await withQuota(m);
    for (let i = 0; i < 4; i += 1) {
      const r = await createOffer(m.actor, { title: `عرض ${i}` });
      expect(r.ok).toBe(true);
    }
    const first = await db.offer.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    await db.offer.update({ where: { id: first.id }, data: { status: "STOPPED" } }); // stopping does not give the offer back
    expect(await createOffer(m.actor, { title: "الخامس" })).toEqual({ ok: false, error: "HOURS_REQUIRED" });
    expect(await createOffer(m.actor, { title: "الخامس", paidHours: 0 })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await createOffer(m.actor, { title: "الخامس", paidHours: 5 })).toEqual({ ok: false, error: "INSUFFICIENT_STARS" });
    expect(await db.offer.count()).toBe(4); // nothing created by the failed attempt

    await fund(m.actor.id, 20);
    const r = await createOffer(m.actor, { title: "الخامس", paidHours: 5 });
    if (!r.ok) throw new Error(`setup ${r.error}`);
    expect(await getStarBalance(db, m.actor.id)).toBe(15);
    const paid = await db.offer.findUniqueOrThrow({ where: { id: r.offerId } });
    expect([paid.quotaUsed, paid.paidHours]).toEqual([false, 5]);
    expect(Math.round((paid.endsAt.getTime() - paid.startsAt.getTime()) / 3_600_000)).toBe(5);
  });

  it("an ended package has no free offers (they are paid per hour), and an admin-created offer never uses the quota", async () => {
    const m = await merchant();
    await withQuota(m, "merchant_stars_200");
    await createOfferAsAdmin(admin, m.shopId, { title: "من الإدارة" });
    expect((await createOffer(m.actor, { title: "مجاني" })).ok).toBe(true);
    expect((await db.offer.findMany({ where: { quotaUsed: true } })).length).toBe(1);
    await db.subscription.update({ where: { userId: m.actor.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await createOffer(m.actor, { title: "بعد انتهاء الباقة" })).toEqual({ ok: false, error: "HOURS_REQUIRED" });
  });
});
