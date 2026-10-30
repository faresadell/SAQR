/**
 * Plan purchase integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { DEFAULT_PLANS } from "@/lib/stars/rules";
import { AuthorizationError } from "@/server/errors";
import { decidePlanPurchase, getMyPlanState, listPlansFor, requestPlanPurchase, updatePlan } from "@/server/plans/service";
import { getStarBalance } from "@/server/stars/ledger";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const supportOnly: Actor = { id: "admin-2", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };
let n = 0;
let uploads = 0;

async function user(role: "CUSTOMER" | "MERCHANT" | "DRIVER"): Promise<Actor> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2012${String(n).padStart(8, "0")}`, name: `P${n}`, passwordHash: "x", role, status: "ACTIVE" } });
  return { id: u.id, role, isSuperAdmin: false, permissions: [] };
}

async function upload(owner: Actor): Promise<string> {
  uploads += 1;
  return (await db.receiptUpload.create({ data: { orderId: null, uploaderId: owner.id, storageKey: `receipts/plan${owner.id}/${uploads}.jpg`, contentType: "image/jpeg", sizeBytes: 10, sha256: `h${uploads}` } })).id;
}

let ref = 0;
const buy = async (who: Actor, planCode: string, referenceNo = `PLAN-REF-${(ref += 1)}`) =>
  requestPlanPurchase(who, { planCode, method: "instapay", referenceNo, uploadId: await upload(who) });

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "PlanPurchase","Subscription","Plan","ReceiptUpload","StarLedgerEntry","StarAccount","PaymentMethodConfig","AuditLog","User" RESTART IDENTITY CASCADE');
  await db.paymentMethodConfig.create({ data: { code: "instapay", nameAr: "انستا باي", isEnabled: true } });
  for (const [i, p] of DEFAULT_PLANS.entries()) await db.plan.create({ data: { ...p, nameAr: p.code, sortOrder: i } });
});

describe("plan purchase", () => {
  it("grants nothing until approved, then base + bonus stars exactly once and 30 days", async () => {
    const c = await user("CUSTOMER");
    const r = await buy(c, "customer_silver");
    if (!r.ok) throw new Error("setup");
    expect(await getStarBalance(db, c.id)).toBe(0);
    expect((await getMyPlanState(c)).subscription).toBeNull();

    expect((await decidePlanPurchase(admin, r.purchaseId, "APPROVE")).ok).toBe(true);
    expect(await getStarBalance(db, c.id)).toBe(90); // 75 + 15
    expect(await db.starLedgerEntry.count({ where: { reason: "PLAN_GRANT" } })).toBe(2);
    const sub = await db.subscription.findUniqueOrThrow({ where: { userId: c.id } });
    expect(Math.round((sub.expiresAt.getTime() - sub.startsAt.getTime()) / 86_400_000)).toBe(30);

    expect(await decidePlanPurchase(admin, r.purchaseId, "APPROVE")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await getStarBalance(db, c.id)).toBe(90);
  });

  it("merchant Gold gives 235 stars; driver plan gives 35", async () => {
    const m = await user("MERCHANT");
    const d = await user("DRIVER");
    const pm = await buy(m, "merchant_gold");
    const pd = await buy(d, "driver_basic");
    if (!pm.ok || !pd.ok) throw new Error("setup");
    await decidePlanPurchase(admin, pm.purchaseId, "APPROVE");
    await decidePlanPurchase(admin, pd.purchaseId, "APPROVE");
    expect(await getStarBalance(db, m.id)).toBe(235);
    expect(await getStarBalance(db, d.id)).toBe(35);
  });

  it("early renewal adds a new cycle after the remaining time", async () => {
    const c = await user("CUSTOMER");
    const first = await buy(c, "customer_bronze");
    if (!first.ok) throw new Error("setup");
    await decidePlanPurchase(admin, first.purchaseId, "APPROVE");
    const before = await db.subscription.findUniqueOrThrow({ where: { userId: c.id } });
    const second = await buy(c, "customer_bronze");
    if (!second.ok) throw new Error("setup");
    await decidePlanPurchase(admin, second.purchaseId, "APPROVE");
    const after = await db.subscription.findUniqueOrThrow({ where: { userId: c.id } });
    expect(after.expiresAt.getTime() - before.expiresAt.getTime()).toBe(30 * 86_400_000);
    expect(await getStarBalance(db, c.id)).toBe(100);
  });

  it("keeps stars after the plan expires", async () => {
    const c = await user("CUSTOMER");
    const r = await buy(c, "customer_bronze");
    if (!r.ok) throw new Error("setup");
    await decidePlanPurchase(admin, r.purchaseId, "APPROVE");
    await db.subscription.update({ where: { userId: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await getMyPlanState(c)).subscription?.isActive).toBe(false);
    expect(await getStarBalance(db, c.id)).toBe(50);
  });

  it("rejects wrong audience, a second pending purchase, someone else's upload and a disabled method", async () => {
    const c = await user("CUSTOMER");
    const other = await user("CUSTOMER");
    expect(await buy(c, "merchant_gold")).toEqual({ ok: false, error: "PLAN_NOT_AVAILABLE" });
    expect((await buy(c, "customer_gold")).ok).toBe(true);
    expect(await buy(c, "customer_bronze")).toEqual({ ok: false, error: "PURCHASE_PENDING" });
    expect(await requestPlanPurchase(other, { planCode: "customer_bronze", method: "instapay", referenceNo: "REF-OTHER-1", uploadId: await upload(c) })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await db.paymentMethodConfig.update({ where: { code: "instapay" }, data: { isEnabled: false } });
    expect(await buy(other, "customer_bronze")).toEqual({ ok: false, error: "PAYMENT_METHOD_DISABLED" });
    expect((await listPlansFor(c)).map((p) => p.code)).toEqual(["customer_bronze", "customer_silver", "customer_gold"]);
  });

  it("only admins with payments.review can decide", async () => {
    const c = await user("CUSTOMER");
    const r = await buy(c, "customer_bronze");
    if (!r.ok) throw new Error("setup");
    await expect(decidePlanPurchase(supportOnly, r.purchaseId, "APPROVE")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(decidePlanPurchase(c, r.purchaseId, "APPROVE")).rejects.toBeInstanceOf(AuthorizationError);
    expect(await getStarBalance(db, c.id)).toBe(0);
  });

  it("two simultaneous approvals grant once", async () => {
    const c = await user("CUSTOMER");
    const r = await buy(c, "customer_gold");
    if (!r.ok) throw new Error("setup");
    const results = await Promise.all([decidePlanPurchase(admin, r.purchaseId, "APPROVE"), decidePlanPurchase(admin, r.purchaseId, "APPROVE")]);
    expect(results.filter((x) => x.ok).length).toBe(1);
    expect(await getStarBalance(db, c.id)).toBe(125);
  });

  it("refuses to approve the same transfer twice and keeps the flag", async () => {
    const a = await user("CUSTOMER");
    const b = await user("CUSTOMER");
    const pa = await buy(a, "customer_bronze", "SAME-TRANSFER-1");
    const pb = await buy(b, "customer_bronze", "SAME-TRANSFER-1");
    if (!pa.ok || !pb.ok) throw new Error("setup");
    expect((await decidePlanPurchase(admin, pa.purchaseId, "APPROVE")).ok).toBe(true);
    expect(await decidePlanPurchase(admin, pb.purchaseId, "APPROVE")).toEqual({ ok: false, error: "DUPLICATE_TRANSFER" });
    expect((await db.planPurchase.findUniqueOrThrow({ where: { id: pb.purchaseId } })).flagged).toBe(true);
    expect(await getStarBalance(db, b.id)).toBe(0);
  });

  it("rejection needs a reason, grants nothing, and lets the user try again", async () => {
    const c = await user("CUSTOMER");
    const r = await buy(c, "customer_bronze");
    if (!r.ok) throw new Error("setup");
    expect(await decidePlanPurchase(admin, r.purchaseId, "REJECT", " ")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await decidePlanPurchase(admin, r.purchaseId, "REJECT", "التحويل غير واضح")).ok).toBe(true);
    expect(await getStarBalance(db, c.id)).toBe(0);
    expect((await buy(c, "customer_bronze")).ok).toBe(true);
  });
});

describe("plan catalog edits", () => {
  it("changes the price for future purchases only, audited, validated", async () => {
    const c = await user("CUSTOMER");
    const r = await buy(c, "customer_bronze");
    if (!r.ok) throw new Error("setup");
    expect((await updatePlan(admin, "customer_bronze", { priceCents: 6000, baseStars: 60 })).ok).toBe(true);
    await decidePlanPurchase(admin, r.purchaseId, "APPROVE");
    expect(await getStarBalance(db, c.id)).toBe(50); // the purchase kept its own snapshot
    expect(await updatePlan(admin, "customer_bronze", { priceCents: -5 })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await expect(updatePlan(supportOnly, "customer_bronze", { priceCents: 6000 })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await db.auditLog.findMany({ where: { action: "PLAN_UPDATED" } })).length).toBe(1);
  });
});
