import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { canBuyTier, FALLBACK_TIER, type TierName } from "@/lib/memberships/rules";
import { computeNewExpiry } from "@/lib/stars/rules";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";
import { assertPaymentMethodEnabled, PaymentMethodDisabledError } from "@/server/payments/methods";
import { transferConfirmedElsewhere } from "@/server/payments/transfers";

export type MembershipError = "INVALID_REQUEST" | "PLAN_NOT_AVAILABLE" | "SHOP_NOT_APPROVED" | "PAYMENT_METHOD_DISABLED" | "PAYMENT_RECEIVER_NOT_SET" | "PURCHASE_PENDING" | "TIER_DOWNGRADE_BLOCKED" | "WRONG_STATE" | "DUPLICATE_TRANSFER" | "CONFLICT";
export type MembershipResult<T = object> = ({ ok: true } & T) | { ok: false; error: MembershipError };

const REFERENCE_PATTERN = /^[A-Za-z0-9\-_/ ]{4,64}$/;

class Abort extends Error {
  constructor(readonly error: MembershipError) {
    super(error);
  }
}
const fail = (error: MembershipError): never => {
  throw new Abort(error);
};
async function run<T extends object>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<MembershipResult<T>> {
  try {
    const value = await db.$transaction(work);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Abort) return { ok: false, error: error.error };
    throw error;
  }
}

/** The shop owned by this merchant user (approved only for buying). Derived from the session, never from the request. */
async function ownShop(tx: Prisma.TransactionClient, actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await tx.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop) throw new NotFoundError();
  return shop;
}

export async function listMembershipPlans() {
  return db.membershipPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { code: true, nameAr: true, priceCents: true, tier: true, durationDays: true } });
}

export async function getMyMembership(actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop) throw new NotFoundError();
  const [membership, purchases] = await Promise.all([
    db.membership.findUnique({ where: { merchantId: shop.id }, include: { plan: { select: { code: true, nameAr: true } } } }),
    db.membershipPurchase.findMany({
      where: { merchantId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, priceCentsSnap: true, tierSnap: true, method: true, referenceNo: true, createdAt: true, decidedAt: true, rejectReason: true, plan: { select: { code: true, nameAr: true } } },
    }),
  ]);
  return {
    tier: shop.tier,
    membership: membership ? { plan: membership.plan, tier: membership.grantedTier, startsAt: membership.startsAt, expiresAt: membership.expiresAt, isActive: membership.expiresAt.getTime() > Date.now() } : null,
    purchases,
  };
}

export interface MembershipPurchaseInput {
  planCode: string;
  method: string;
  referenceNo: string;
  uploadId: string;
}

/** The shop owner sends transfer proof. Nothing changes (no tier, no benefit) until an admin approves. */
export async function requestMembershipPurchase(actor: Actor, input: MembershipPurchaseInput): Promise<MembershipResult<{ purchaseId: string }>> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const referenceNo = typeof input.referenceNo === "string" ? input.referenceNo.trim() : "";
  if (!REFERENCE_PATTERN.test(referenceNo) || typeof input.uploadId !== "string" || input.uploadId.length < 8 || input.uploadId.length > 64) return { ok: false, error: "INVALID_REQUEST" };
  try {
    await assertPaymentMethodEnabled(String(input.method));
  } catch (error) {
    if (error instanceof PaymentMethodDisabledError) return { ok: false, error: error.reason === "NO_RECEIVER" ? "PAYMENT_RECEIVER_NOT_SET" : "PAYMENT_METHOD_DISABLED" };
    throw error;
  }
  try {
    return await run(async (tx) => {
      const shop = await ownShop(tx, actor);
      if (shop.status !== "APPROVED") return fail("SHOP_NOT_APPROVED");
      const plan = await tx.membershipPlan.findFirst({ where: { code: String(input.planCode), isActive: true } });
      if (!plan) return fail("PLAN_NOT_AVAILABLE");
      const current = await tx.membership.findUnique({ where: { merchantId: shop.id } });
      const activeTier: TierName | null = current && current.expiresAt.getTime() > Date.now() ? current.grantedTier : null;
      if (!canBuyTier(activeTier, plan.tier)) return fail("TIER_DOWNGRADE_BLOCKED");
      if ((await tx.membershipPurchase.count({ where: { merchantId: shop.id, status: "PENDING" } })) > 0) return fail("PURCHASE_PENDING");

      const upload = await tx.receiptUpload.findFirst({ where: { id: input.uploadId, orderId: null, uploaderId: actor.id, usedAt: null } });
      if (!upload) return fail("INVALID_REQUEST");
      const claimed = await tx.receiptUpload.updateMany({ where: { id: upload.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) return fail("CONFLICT");

      const reused = await tx.membershipPurchase.findFirst({ where: { method: input.method, referenceNo, status: { not: "REJECTED" } } });
      const purchase = await tx.membershipPurchase.create({
        data: {
          merchantId: shop.id,
          planId: plan.id,
          priceCentsSnap: plan.priceCents,
          tierSnap: plan.tier,
          durationDaysSnap: plan.durationDays,
          method: input.method,
          referenceNo,
          receiptUploadId: upload.id,
          flagged: reused !== null,
          flagReason: reused ? "Transfer reference already used on another purchase" : null,
        },
      });
      await writeAudit({ actorId: actor.id, action: "MEMBERSHIP_PURCHASE_REQUESTED", entityType: "MembershipPurchase", entityId: purchase.id, after: { plan: plan.code, priceCents: plan.priceCents } }, tx);
      return { purchaseId: purchase.id };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") return { ok: false, error: "PURCHASE_PENDING" };
    throw error;
  }
}

/**
 * Admin decision (payments.review). APPROVE, once: purchase PENDING -> APPROVED (compare-and-set), membership created or
 * extended (early renewal keeps the remaining time), shop tier set to the plan's tier. The tier change is audited the same way
 * as a manual change. Orders already placed keep the tier and rate they were created with.
 */
export async function decideMembershipPurchase(actor: Actor, purchaseId: string, decision: "APPROVE" | "REJECT", reason?: string): Promise<MembershipResult<object>> {
  if (!hasPermission(actor, "payments.review")) throw new AuthorizationError();
  const clean = reason?.trim() ?? "";
  if (decision === "REJECT" && (clean.length < 3 || clean.length > 300)) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const purchase = await tx.membershipPurchase.findUnique({ where: { id: purchaseId }, include: { plan: true, merchant: true } });
    if (!purchase) throw new NotFoundError();
    if (purchase.status !== "PENDING") return fail("WRONG_STATE");
    const now = new Date();
    const ownerId = purchase.merchant.ownerId;

    if (decision === "REJECT") {
      const done = await tx.membershipPurchase.updateMany({ where: { id: purchase.id, status: "PENDING" }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: now, rejectReason: clean } });
      if (done.count !== 1) return fail("CONFLICT");
      await notifyInTx(tx, { userId: ownerId, type: "MEMBERSHIP_REJECTED", title: "تم رفض طلب العضوية", body: `رُفض طلب شراء العضوية: ${clean}.`, data: { purchaseId: purchase.id }, dedupeKey: `membership-rejected:${purchase.id}` });
      await writeAudit({ actorId: actor.id, action: "MEMBERSHIP_PURCHASE_REJECTED", entityType: "MembershipPurchase", entityId: purchase.id, after: { reason: clean } }, tx);
      return {};
    }

    if (purchase.merchant.status !== "APPROVED") return fail("SHOP_NOT_APPROVED");
    if (await transferConfirmedElsewhere(tx, purchase.method, purchase.referenceNo, { membershipPurchaseId: purchase.id })) {
      // Written outside the transaction on purpose: the abort below rolls the transaction back, the flag must survive.
      await db.membershipPurchase.update({ where: { id: purchase.id }, data: { flagged: true, flagReason: "Transfer reference already confirmed elsewhere" } });
      return fail("DUPLICATE_TRANSFER");
    }
    const done = await tx.membershipPurchase.updateMany({ where: { id: purchase.id, status: "PENDING" }, data: { status: "APPROVED", decidedById: actor.id, decidedAt: now } });
    if (done.count !== 1) return fail("CONFLICT");

    const current = await tx.membership.findUnique({ where: { merchantId: purchase.merchantId } });
    const active = current !== null && current.expiresAt.getTime() > now.getTime();
    const activeTier: TierName | null = active ? current!.grantedTier : null;
    if (!canBuyTier(activeTier, purchase.tierSnap)) return fail("TIER_DOWNGRADE_BLOCKED");
    const expiresAt = computeNewExpiry(now, current?.expiresAt ?? null, purchase.durationDaysSnap);
    await tx.membership.upsert({
      where: { merchantId: purchase.merchantId },
      create: { merchantId: purchase.merchantId, planId: purchase.planId, grantedTier: purchase.tierSnap, startsAt: now, expiresAt },
      update: { planId: purchase.planId, grantedTier: purchase.tierSnap, expiresAt, startsAt: active ? current!.startsAt : now, tierRevertedAt: null, reminderSentAt: null, expiredNotifiedAt: null },
    });

    if (purchase.merchant.tier !== purchase.tierSnap) {
      const changed = await tx.merchant.updateMany({ where: { id: purchase.merchantId, tier: purchase.merchant.tier }, data: { tier: purchase.tierSnap } });
      if (changed.count !== 1) return fail("CONFLICT");
      await writeAudit({ actorId: actor.id, action: "MERCHANT_TIER_CHANGED", entityType: "Merchant", entityId: purchase.merchantId, before: { tier: purchase.merchant.tier }, after: { tier: purchase.tierSnap, reason: `membership ${purchase.plan.code}` } }, tx);
    }
    await notifyInTx(tx, { userId: ownerId, type: "MEMBERSHIP_APPROVED", title: "تم تفعيل عضويتك", body: `تم تفعيل عضوية ${purchase.plan.nameAr} حتى ${expiresAt.toISOString().slice(0, 10)}.`, data: { purchaseId: purchase.id }, dedupeKey: `membership-approved:${purchase.id}` });
    await writeAudit({ actorId: actor.id, action: "MEMBERSHIP_PURCHASE_APPROVED", entityType: "MembershipPurchase", entityId: purchase.id, after: { plan: purchase.plan.code, tier: purchase.tierSnap, expiresAt: expiresAt.toISOString() } }, tx);
    return {};
  });
}

export async function listMembershipPurchasesForReview(actor: Actor, status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  if (!hasPermission(actor, "payments.review")) throw new AuthorizationError();
  return db.membershipPurchase.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, merchantId: true, status: true, priceCentsSnap: true, tierSnap: true, method: true, referenceNo: true, receiptUploadId: true, flagged: true, flagReason: true, createdAt: true, plan: { select: { code: true, nameAr: true } } },
  });
}

/** Admin catalog edit; past purchases keep their snapshot. The commission RATES themselves are changed only in the commission settings. */
export async function updateMembershipPlan(actor: Actor, code: string, change: { priceCents?: number; durationDays?: number; isActive?: boolean }): Promise<MembershipResult<object>> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const ok = (v: number | undefined, max: number) => v === undefined || (Number.isInteger(v) && v >= 1 && v <= max);
  if (!ok(change.priceCents, 10_000_000) || !ok(change.durationDays, 366)) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const plan = await tx.membershipPlan.findUnique({ where: { code } });
    if (!plan) throw new NotFoundError();
    const updated = await tx.membershipPlan.update({ where: { code }, data: change });
    await writeAudit({ actorId: actor.id, action: "MEMBERSHIP_PLAN_UPDATED", entityType: "MembershipPlan", entityId: plan.id, before: { priceCents: plan.priceCents, durationDays: plan.durationDays, isActive: plan.isActive }, after: { priceCents: updated.priceCents, durationDays: updated.durationDays, isActive: updated.isActive } }, tx);
    return {};
  });
}

export interface MaintenanceSummary {
  reminded: number;
  expired: number;
  reverted: number;
}

/**
 * Hourly job: 3-day reminder, expiry notice, and the fall back to the regular tier when Premium time ends.
 * Each step is marked on the row (compare-and-set) and uses a dedupe key, so reruns and concurrent runs do nothing extra.
 * The fall back only touches a shop whose tier is still the one the membership granted.
 */
export async function runMembershipMaintenance(now = new Date()): Promise<MaintenanceSummary> {
  const summary: MaintenanceSummary = { reminded: 0, expired: 0, reverted: 0 };
  const soon = await db.membership.findMany({ where: { reminderSentAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + 3 * 86_400_000) } }, include: { merchant: true }, take: 500 });
  for (const m of soon) {
    await db.$transaction(async (tx) => {
      const claimed = await tx.membership.updateMany({ where: { id: m.id, reminderSentAt: null, expiresAt: m.expiresAt }, data: { reminderSentAt: now } });
      if (claimed.count !== 1) return;
      await notifyInTx(tx, { userId: m.merchant.ownerId, type: "MEMBERSHIP_EXPIRING", title: "عضويتك على وشك الانتهاء", body: `تنتهي عضويتك بتاريخ ${m.expiresAt.toISOString().slice(0, 10)}. جدّد مبكرًا وتُضاف المدة المتبقية.`, dedupeKey: `membership-expiring:${m.merchantId}:${m.expiresAt.toISOString()}` });
      summary.reminded += 1;
    });
  }
  const ended = await db.membership.findMany({ where: { OR: [{ expiredNotifiedAt: null }, { tierRevertedAt: null }], expiresAt: { lte: now } }, include: { merchant: true }, take: 500 });
  for (const m of ended) {
    await db.$transaction(async (tx) => {
      const stamp = m.expiresAt.toISOString();
      if (m.expiredNotifiedAt === null) {
        const claimed = await tx.membership.updateMany({ where: { id: m.id, expiredNotifiedAt: null, expiresAt: m.expiresAt }, data: { expiredNotifiedAt: now } });
        if (claimed.count === 1) {
          await notifyInTx(tx, { userId: m.merchant.ownerId, type: "MEMBERSHIP_EXPIRED", title: "انتهت عضويتك", body: "انتهت مدة عضويتك وعادت العمولة إلى النسبة العادية للطلبات الجديدة.", dedupeKey: `membership-expired:${m.merchantId}:${stamp}` });
          summary.expired += 1;
        }
      }
      if (m.tierRevertedAt === null) {
        const marked = await tx.membership.updateMany({ where: { id: m.id, tierRevertedAt: null, expiresAt: m.expiresAt }, data: { tierRevertedAt: now } });
        if (marked.count === 1 && m.grantedTier !== FALLBACK_TIER) {
          const reverted = await tx.merchant.updateMany({ where: { id: m.merchantId, tier: m.grantedTier }, data: { tier: FALLBACK_TIER } });
          if (reverted.count === 1) {
            await writeAudit({ actorId: null, action: "MERCHANT_TIER_CHANGED", entityType: "Merchant", entityId: m.merchantId, before: { tier: m.grantedTier }, after: { tier: FALLBACK_TIER, reason: "membership expired" } }, tx);
            summary.reverted += 1;
          }
        }
      }
    });
  }
  return summary;
}


export async function listAllMembershipPlans(actor: Actor) {
  if (!hasPermission(actor, "settings.view") && !hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  return db.membershipPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true, nameAr: true, priceCents: true, tier: true, durationDays: true, isActive: true } });
}
