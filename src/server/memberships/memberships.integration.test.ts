/**
 * Merchant membership integration tests (real PostgreSQL):  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { DEFAULT_MEMBERSHIP_PLANS } from "@/lib/memberships/rules";
import { AuthorizationError } from "@/server/errors";
import { decideMembershipPurchase, getMyMembership, requestMembershipPurchase, runMembershipMaintenance, updateMembershipPlan } from "@/server/memberships/service";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const supportOnly: Actor = { id: "admin-2", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };
let n = 0;
let uploads = 0;
let ref = 0;

async function shopOwner(status: "APPROVED" | "PENDING_REVIEW" = "APPROVED"): Promise<{ actor: Actor; merchantId: string }> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2013${String(n).padStart(8, "0")}`, name: `M${n}`, passwordHash: "x", role: "MERCHANT", status: "ACTIVE" } });
  const m = await db.merchant.create({ data: { ownerId: u.id, name: `shop ${n}`, businessType: "restaurant", status } });
  return { actor: { id: u.id, role: "MERCHANT", isSuperAdmin: false, permissions: [] }, merchantId: m.id };
}

async function upload(owner: Actor): Promise<string> {
  uploads += 1;
  return (await db.receiptUpload.create({ data: { orderId: null, uploaderId: owner.id, storageKey: `receipts/plan${owner.id}/${uploads}.jpg`, contentType: "image/jpeg", sizeBytes: 10, sha256: `mh${uploads}` } })).id;
}

const buy = async (who: Actor, planCode: string, referenceNo = `MEM-REF-${(ref += 1)}`) =>
  requestMembershipPurchase(who, { planCode, method: "instapay", referenceNo, uploadId: await upload(who) });

const tierOf = async (merchantId: string) => (await db.merchant.findUniqueOrThrow({ where: { id: merchantId } })).tier;

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "MembershipPurchase","Membership","MembershipPlan","PlanPurchase","ReceiptUpload","Payment","PaymentMethodConfig","Notification","AuditLog","Merchant","BusinessType","User" RESTART IDENTITY CASCADE');
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
  await db.paymentMethodConfig.create({ data: { code: "instapay", nameAr: "انستا باي", isEnabled: true } });
  for (const [i, p] of DEFAULT_MEMBERSHIP_PLANS.entries()) await db.membershipPlan.create({ data: { ...p, sortOrder: i } });
});

describe("membership purchase", () => {
  it("changes nothing until approved, then sets the Premium tier once for 30 days, audited and notified", async () => {
    const { actor, merchantId } = await shopOwner();
    const r = await buy(actor, "premium");
    if (!r.ok) throw new Error("setup");
    expect(await tierOf(merchantId)).toBe("REGULAR");
    expect((await getMyMembership(actor)).membership).toBeNull();

    expect((await decideMembershipPurchase(admin, r.purchaseId, "APPROVE")).ok).toBe(true);
    expect(await tierOf(merchantId)).toBe("BUSINESS");
    const m = await db.membership.findUniqueOrThrow({ where: { merchantId } });
    expect(Math.round((m.expiresAt.getTime() - m.startsAt.getTime()) / 86_400_000)).toBe(30);
    expect(await decideMembershipPurchase(admin, r.purchaseId, "APPROVE")).toEqual({ ok: false, error: "WRONG_STATE" });
    expect(await db.auditLog.count({ where: { action: "MERCHANT_TIER_CHANGED", entityId: merchantId } })).toBe(1);
    expect(await db.notification.count({ where: { userId: actor.id, type: "MEMBERSHIP_APPROVED" } })).toBe(1);
  });

  it("Plus keeps the regular 8% tier (no Plus benefit was specified)", async () => {
    const { actor, merchantId } = await shopOwner();
    const r = await buy(actor, "plus");
    if (!r.ok) throw new Error("setup");
    await decideMembershipPurchase(admin, r.purchaseId, "APPROVE");
    expect(await tierOf(merchantId)).toBe("REGULAR");
    expect((await getMyMembership(actor)).membership?.isActive).toBe(true);
  });

  it("early renewal adds a new cycle after the remaining time; Plus -> Premium upgrade keeps the time; Premium -> Plus is blocked", async () => {
    const { actor, merchantId } = await shopOwner();
    const first = await buy(actor, "plus");
    if (!first.ok) throw new Error("setup");
    await decideMembershipPurchase(admin, first.purchaseId, "APPROVE");
    const before = await db.membership.findUniqueOrThrow({ where: { merchantId } });
    const up = await buy(actor, "premium");
    if (!up.ok) throw new Error("setup");
    await decideMembershipPurchase(admin, up.purchaseId, "APPROVE");
    const after = await db.membership.findUniqueOrThrow({ where: { merchantId } });
    expect(after.expiresAt.getTime() - before.expiresAt.getTime()).toBe(30 * 86_400_000);
    expect(await tierOf(merchantId)).toBe("BUSINESS");
    expect(await buy(actor, "plus")).toEqual({ ok: false, error: "TIER_DOWNGRADE_BLOCKED" });
  });

  it("rejects non-approved shops, customers, a second pending purchase, a foreign upload and a disabled method", async () => {
    const pending = await shopOwner("PENDING_REVIEW");
    expect(await buy(pending.actor, "premium")).toEqual({ ok: false, error: "SHOP_NOT_APPROVED" });
    const { actor } = await shopOwner();
    await expect(requestMembershipPurchase({ ...actor, role: "CUSTOMER" }, { planCode: "plus", method: "instapay", referenceNo: "REF-CUST-1", uploadId: "whatever-id" })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await buy(actor, "plus")).ok).toBe(true);
    expect(await buy(actor, "premium")).toEqual({ ok: false, error: "PURCHASE_PENDING" });
    const other = await shopOwner();
    expect(await requestMembershipPurchase(other.actor, { planCode: "plus", method: "instapay", referenceNo: "REF-OTHER-9", uploadId: await upload(actor) })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await buy(other.actor, "nope")).toEqual({ ok: false, error: "PLAN_NOT_AVAILABLE" });
    await db.paymentMethodConfig.update({ where: { code: "instapay" }, data: { isEnabled: false } });
    expect(await buy(other.actor, "plus")).toEqual({ ok: false, error: "PAYMENT_METHOD_DISABLED" });
  });

  it("only admins with payments.review decide; two simultaneous approvals grant once", async () => {
    const { actor, merchantId } = await shopOwner();
    const r = await buy(actor, "premium");
    if (!r.ok) throw new Error("setup");
    await expect(decideMembershipPurchase(supportOnly, r.purchaseId, "APPROVE")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(decideMembershipPurchase(actor, r.purchaseId, "APPROVE")).rejects.toBeInstanceOf(AuthorizationError);
    const results = await Promise.all([decideMembershipPurchase(admin, r.purchaseId, "APPROVE"), decideMembershipPurchase(admin, r.purchaseId, "APPROVE")]);
    expect(results.filter((x) => x.ok).length).toBe(1);
    expect(await db.auditLog.count({ where: { action: "MERCHANT_TIER_CHANGED", entityId: merchantId } })).toBe(1);
    expect((await db.membership.findUniqueOrThrow({ where: { merchantId } })).grantedTier).toBe("BUSINESS");
  });

  it("refuses a transfer already confirmed as a plan purchase, keeps the flag; rejection needs a reason", async () => {
    const { actor } = await shopOwner();
    const r = await buy(actor, "premium", "SHARED-REF-1");
    if (!r.ok) throw new Error("setup");
    const planUser = await db.user.create({ data: { phone: "+201300000999", name: "c", passwordHash: "x", role: "CUSTOMER", status: "ACTIVE" } });
    const plan = await db.plan.create({ data: { code: "customer_bronze", audience: "CUSTOMER", nameAr: "x", priceCents: 5000, baseStars: 50 } });
    const planUpload = await db.receiptUpload.create({ data: { orderId: null, uploaderId: planUser.id, storageKey: "receipts/planx/1.jpg", contentType: "image/jpeg", sizeBytes: 1, sha256: "zz" } });
    await db.planPurchase.create({ data: { userId: planUser.id, planId: plan.id, priceCentsSnap: 5000, baseStarsSnap: 50, bonusStarsSnap: 0, method: "instapay", referenceNo: "SHARED-REF-1", receiptUploadId: planUpload.id, status: "APPROVED" } });
    expect(await decideMembershipPurchase(admin, r.purchaseId, "APPROVE")).toEqual({ ok: false, error: "DUPLICATE_TRANSFER" });
    expect((await db.membershipPurchase.findUniqueOrThrow({ where: { id: r.purchaseId } })).flagged).toBe(true);
    expect(await decideMembershipPurchase(admin, r.purchaseId, "REJECT", " ")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect((await decideMembershipPurchase(admin, r.purchaseId, "REJECT", "التحويل غير مطابق")).ok).toBe(true);
    expect((await buy(actor, "premium")).ok).toBe(true);
  });
});

describe("membership expiry", () => {
  it("falls back to the regular tier once, notifies once each, and never touches a tier changed by hand", async () => {
    const a = await shopOwner();
    const b = await shopOwner();
    for (const s of [a, b]) {
      const r = await buy(s.actor, "premium");
      if (!r.ok) throw new Error("setup");
      await decideMembershipPurchase(admin, r.purchaseId, "APPROVE");
      await db.membership.update({ where: { merchantId: s.merchantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    }
    await db.merchant.update({ where: { id: b.merchantId }, data: { tier: "REGULAR" } }); // an admin already moved it manually
    const first = await runMembershipMaintenance();
    const second = await runMembershipMaintenance();
    expect(first.reverted).toBe(1);
    expect(second).toEqual({ reminded: 0, expired: 0, reverted: 0 });
    expect(await tierOf(a.merchantId)).toBe("REGULAR");
    expect(await db.notification.count({ where: { type: "MEMBERSHIP_EXPIRED" } })).toBe(2);
  });

  it("sends the 3-day reminder once, and a renewal after expiry restores the tier", async () => {
    const { actor, merchantId } = await shopOwner();
    const r = await buy(actor, "premium");
    if (!r.ok) throw new Error("setup");
    await decideMembershipPurchase(admin, r.purchaseId, "APPROVE");
    await db.membership.update({ where: { merchantId }, data: { expiresAt: new Date(Date.now() + 2 * 86_400_000) } });
    await runMembershipMaintenance();
    await runMembershipMaintenance();
    expect(await db.notification.count({ where: { userId: actor.id, type: "MEMBERSHIP_EXPIRING" } })).toBe(1);
    await db.membership.update({ where: { merchantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await runMembershipMaintenance();
    expect(await tierOf(merchantId)).toBe("REGULAR");
    const again = await buy(actor, "premium");
    if (!again.ok) throw new Error("setup");
    await decideMembershipPurchase(admin, again.purchaseId, "APPROVE");
    expect(await tierOf(merchantId)).toBe("BUSINESS");
    expect((await db.membership.findUniqueOrThrow({ where: { merchantId } })).tierRevertedAt).toBeNull();
  });
});

describe("membership catalog", () => {
  it("edits prices for future purchases only, validated and audited", async () => {
    const { actor } = await shopOwner();
    const r = await buy(actor, "premium");
    if (!r.ok) throw new Error("setup");
    expect((await updateMembershipPlan(admin, "premium", { priceCents: 7000 })).ok).toBe(true);
    expect((await db.membershipPurchase.findUniqueOrThrow({ where: { id: r.purchaseId } })).priceCentsSnap).toBe(6000);
    expect(await updateMembershipPlan(admin, "premium", { priceCents: 0 })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    await expect(updateMembershipPlan(supportOnly, "premium", { priceCents: 7000 })).rejects.toBeInstanceOf(AuthorizationError);
    expect(await db.auditLog.count({ where: { action: "MEMBERSHIP_PLAN_UPDATED" } })).toBe(1);
  });
});
