import "server-only";
import type { PlanAudience, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { computeNewExpiry, ledgerKeys, PLAN_CYCLE_DAYS } from "@/lib/stars/rules";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { assertPaymentMethodEnabled, PaymentMethodDisabledError } from "@/server/payments/methods";
import { notifyInTx } from "@/server/notifications/service";
import { applyStarMoves, type StarMove } from "@/server/stars/ledger";

export type PlanError = "INVALID_REQUEST" | "PLAN_NOT_AVAILABLE" | "PAYMENT_METHOD_DISABLED" | "PURCHASE_PENDING" | "WRONG_STATE" | "DUPLICATE_TRANSFER" | "CONFLICT";
export type PlanResult<T = object> = ({ ok: true } & T) | { ok: false; error: PlanError };

const REFERENCE_PATTERN = /^[A-Za-z0-9\-_/ ]{4,64}$/;

export function audienceFor(role: Actor["role"]): PlanAudience | null {
  return role === "CUSTOMER" ? "CUSTOMER" : role === "DRIVER" ? "DRIVER" : role === "MERCHANT" ? "MERCHANT" : null;
}

class Abort extends Error {
  constructor(readonly error: PlanError) {
    super(error);
  }
}
const fail = (error: PlanError): never => {
  throw new Abort(error);
};

async function run<T extends object>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<PlanResult<T>> {
  try {
    const value = await db.$transaction(work);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Abort) return { ok: false, error: error.error };
    throw error;
  }
}

/** Plans the signed-in user may buy (their audience only, active only). */
export async function listPlansFor(actor: Actor) {
  const audience = audienceFor(actor.role);
  if (!audience) return [];
  return db.plan.findMany({
    where: { audience, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, nameAr: true, priceCents: true, baseStars: true, bonusStars: true, offerQuota: true },
  });
}

export async function getMyPlanState(actor: Actor) {
  const [subscription, purchases] = await Promise.all([
    db.subscription.findUnique({ where: { userId: actor.id }, include: { plan: { select: { code: true, nameAr: true } } } }),
    db.planPurchase.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, priceCentsSnap: true, baseStarsSnap: true, bonusStarsSnap: true, method: true, referenceNo: true, createdAt: true, decidedAt: true, rejectReason: true, plan: { select: { code: true, nameAr: true } } },
    }),
  ]);
  const now = Date.now();
  return {
    subscription: subscription ? { plan: subscription.plan, startsAt: subscription.startsAt, expiresAt: subscription.expiresAt, isActive: subscription.expiresAt.getTime() > now } : null,
    purchases,
  };
}

export interface PurchaseInput {
  planCode: string;
  method: string;
  referenceNo: string;
  uploadId: string;
}

/** The buyer sends transfer proof for a plan. Nothing is activated and no stars are granted until an admin approves. */
export async function requestPlanPurchase(actor: Actor, input: PurchaseInput): Promise<PlanResult<{ purchaseId: string }>> {
  const audience = audienceFor(actor.role);
  if (!audience) throw new AuthorizationError();
  const referenceNo = typeof input.referenceNo === "string" ? input.referenceNo.trim() : "";
  if (!REFERENCE_PATTERN.test(referenceNo) || typeof input.uploadId !== "string" || input.uploadId.length < 8 || input.uploadId.length > 64) return { ok: false, error: "INVALID_REQUEST" };
  try {
    await assertPaymentMethodEnabled(String(input.method));
  } catch (error) {
    if (error instanceof PaymentMethodDisabledError) return { ok: false, error: "PAYMENT_METHOD_DISABLED" };
    throw error;
  }
  try {
    return await run(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: actor.id } });
      if (!user || user.status !== "ACTIVE") throw new AuthorizationError();
      const plan = await tx.plan.findFirst({ where: { code: String(input.planCode), audience, isActive: true } }); // audience-scoped
      if (!plan) return fail("PLAN_NOT_AVAILABLE");
      if ((await tx.planPurchase.count({ where: { userId: actor.id, status: "PENDING" } })) > 0) return fail("PURCHASE_PENDING");

      const upload = await tx.receiptUpload.findFirst({ where: { id: input.uploadId, orderId: null, uploaderId: actor.id, usedAt: null } });
      if (!upload) return fail("INVALID_REQUEST");
      const claimed = await tx.receiptUpload.updateMany({ where: { id: upload.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) return fail("CONFLICT");

      const reused = await tx.planPurchase.findFirst({ where: { method: input.method, referenceNo, status: { not: "REJECTED" } } });
      const purchase = await tx.planPurchase.create({
        data: {
          userId: actor.id,
          planId: plan.id,
          priceCentsSnap: plan.priceCents,
          baseStarsSnap: plan.baseStars,
          bonusStarsSnap: plan.bonusStars,
          method: input.method,
          referenceNo,
          receiptUploadId: upload.id,
          flagged: reused !== null,
          flagReason: reused ? "Transfer reference already used on another purchase" : null,
        },
      });
      await writeAudit({ actorId: actor.id, action: "PLAN_PURCHASE_REQUESTED", entityType: "PlanPurchase", entityId: purchase.id, after: { plan: plan.code, priceCents: plan.priceCents } }, tx);
      return { purchaseId: purchase.id };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") return { ok: false, error: "PURCHASE_PENDING" }; // partial unique index: one pending per user
    throw error;
  }
}

/**
 * Admin decision. APPROVE is atomic and happens once: purchase PENDING -> APPROVED (compare-and-set), subscription
 * created or extended (early renewal keeps the remaining time), base + bonus stars granted with fixed ledger keys.
 */
export async function decidePlanPurchase(actor: Actor, purchaseId: string, decision: "APPROVE" | "REJECT", reason?: string): Promise<PlanResult<object>> {
  if (!hasPermission(actor, "payments.review")) throw new AuthorizationError();
  const clean = reason?.trim() ?? "";
  if (decision === "REJECT" && (clean.length < 3 || clean.length > 300)) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const purchase = await tx.planPurchase.findUnique({ where: { id: purchaseId }, include: { plan: true } });
    if (!purchase) throw new NotFoundError();
    if (purchase.status !== "PENDING") return fail("WRONG_STATE");

    const now = new Date();
    if (decision === "REJECT") {
      const done = await tx.planPurchase.updateMany({ where: { id: purchase.id, status: "PENDING" }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: now, rejectReason: clean } });
      if (done.count !== 1) return fail("CONFLICT");
      await notifyInTx(tx, { userId: purchase.userId, type: "PLAN_REJECTED", title: "تم رفض طلب الباقة", body: `رُفض طلب شراء الباقة: ${clean}.`, data: { purchaseId: purchase.id }, dedupeKey: `plan-purchase-rejected:${purchase.id}` });
      await writeAudit({ actorId: actor.id, action: "PLAN_PURCHASE_REJECTED", entityType: "PlanPurchase", entityId: purchase.id, after: { reason: clean } }, tx);
      return {};
    }

    // The same transfer can never fund two approved purchases or an order payment.
    const usedByPurchase = await tx.planPurchase.findFirst({ where: { method: purchase.method, referenceNo: purchase.referenceNo, status: "APPROVED", id: { not: purchase.id } } });
    const usedByOrder = await tx.payment.findFirst({ where: { method: purchase.method, referenceNo: purchase.referenceNo, confirmedAt: { not: null } } });
    if (usedByPurchase || usedByOrder) {
      // Written outside the transaction on purpose: the abort below rolls the transaction back, the flag must survive.
      await db.planPurchase.update({ where: { id: purchase.id }, data: { flagged: true, flagReason: "Transfer reference already confirmed elsewhere" } });
      return fail("DUPLICATE_TRANSFER");
    }

    const done = await tx.planPurchase.updateMany({ where: { id: purchase.id, status: "PENDING" }, data: { status: "APPROVED", decidedById: actor.id, decidedAt: now } });
    if (done.count !== 1) return fail("CONFLICT");

    const current = await tx.subscription.findUnique({ where: { userId: purchase.userId } });
    const expiresAt = computeNewExpiry(now, current?.expiresAt ?? null, PLAN_CYCLE_DAYS);
    const active = current !== null && current.expiresAt.getTime() > now.getTime();
    await tx.subscription.upsert({
      where: { userId: purchase.userId },
      create: { userId: purchase.userId, planId: purchase.planId, startsAt: now, expiresAt },
      update: { planId: purchase.planId, expiresAt, startsAt: active ? current!.startsAt : now, reminderSentAt: null, expiredNotifiedAt: null },
    });

    const moves: StarMove[] = [{ userId: purchase.userId, amount: purchase.baseStarsSnap, reason: "PLAN_GRANT", idempotencyKey: ledgerKeys.planGrant(purchase.userId, purchase.id, "base"), actorId: actor.id, note: purchase.plan.code }];
    if (purchase.bonusStarsSnap > 0) moves.push({ userId: purchase.userId, amount: purchase.bonusStarsSnap, reason: "PLAN_GRANT", idempotencyKey: ledgerKeys.planGrant(purchase.userId, purchase.id, "bonus"), actorId: actor.id, note: `${purchase.plan.code} bonus` });
    await applyStarMoves(tx, moves);

    await notifyInTx(tx, { userId: purchase.userId, type: "PLAN_APPROVED", title: "تم تفعيل باقتك", body: `تم تفعيل الباقة وإضافة ${purchase.baseStarsSnap + purchase.bonusStarsSnap} نجمة. صالحة حتى ${expiresAt.toISOString().slice(0, 10)}.`, data: { purchaseId: purchase.id }, dedupeKey: `plan-purchase-approved:${purchase.id}` });
    await writeAudit({ actorId: actor.id, action: "PLAN_PURCHASE_APPROVED", entityType: "PlanPurchase", entityId: purchase.id, after: { plan: purchase.plan.code, expiresAt: expiresAt.toISOString(), stars: purchase.baseStarsSnap + purchase.bonusStarsSnap } }, tx);
    return {};
  });
}

export async function listPurchasesForReview(actor: Actor, status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  if (!hasPermission(actor, "payments.review")) throw new AuthorizationError();
  return db.planPurchase.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, userId: true, status: true, priceCentsSnap: true, baseStarsSnap: true, bonusStarsSnap: true, method: true, referenceNo: true, receiptUploadId: true, flagged: true, flagReason: true, createdAt: true, plan: { select: { code: true, nameAr: true } } },
  });
}

/** Admin catalog edit. Purchases keep their own snapshot, so this only affects future purchases. */
export async function updatePlan(actor: Actor, code: string, change: { priceCents?: number; baseStars?: number; bonusStars?: number; offerQuota?: number | null; isActive?: boolean }): Promise<PlanResult<object>> {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const ok = (v: number | undefined, max: number, min = 0) => v === undefined || (Number.isInteger(v) && v >= min && v <= max);
  if (!ok(change.priceCents, 10_000_000, 1) || !ok(change.baseStars, 100_000) || !ok(change.bonusStars, 100_000) || (change.offerQuota != null && !ok(change.offerQuota, 1000))) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const plan = await tx.plan.findUnique({ where: { code } });
    if (!plan) throw new NotFoundError();
    const updated = await tx.plan.update({ where: { code }, data: change });
    await writeAudit({ actorId: actor.id, action: "PLAN_UPDATED", entityType: "Plan", entityId: plan.id, before: { priceCents: plan.priceCents, baseStars: plan.baseStars, bonusStars: plan.bonusStars, offerQuota: plan.offerQuota, isActive: plan.isActive }, after: { priceCents: updated.priceCents, baseStars: updated.baseStars, bonusStars: updated.bonusStars, offerQuota: updated.offerQuota, isActive: updated.isActive } }, tx);
    return {};
  });
}
