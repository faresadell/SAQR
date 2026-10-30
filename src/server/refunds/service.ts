import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";

export type RefundError = "INVALID_REQUEST" | "WRONG_STATE" | "CONFLICT";
export type RefundResult = { ok: true } | { ok: false; error: RefundError };

class Abort extends Error {
  constructor(readonly error: RefundError) {
    super(error);
  }
}
const fail = (error: RefundError): never => {
  throw new Abort(error);
};
async function run(work: (tx: Prisma.TransactionClient) => Promise<void>): Promise<RefundResult> {
  try {
    await db.$transaction(work);
    return { ok: true };
  } catch (error) {
    if (error instanceof Abort) return { ok: false, error: error.error };
    throw error;
  }
}

const refundSelect = {
  id: true,
  orderId: true,
  amountCents: true,
  status: true,
  dueAt: true,
  proofKey: true,
  verifiedAt: true,
  decisionNote: true,
  createdAt: true,
  order: { select: { number: true } },
} satisfies Prisma.RefundSelect;

function visibility(actor: Actor): Prisma.RefundWhereInput {
  if (actor.role === "CUSTOMER") return { order: { customerId: actor.id } };
  if (actor.role === "MERCHANT") return { order: { merchant: { ownerId: actor.id } } };
  if (hasPermission(actor, "refunds.verify")) return {};
  return { id: "__none__" };
}

/** Own refunds (customer: refunds owed to them, merchant: refunds they owe), admins with refunds.verify see all. `isOverdue` is computed on the server clock. */
export async function listRefunds(actor: Actor, status?: "PENDING" | "UNDER_REVIEW" | "COMPLETED") {
  const rows = await db.refund.findMany({ where: { ...visibility(actor), ...(status ? { status } : {}) }, select: refundSelect, orderBy: { createdAt: "desc" }, take: 100 });
  const now = Date.now();
  return rows.map((r) => ({ ...r, proofKey: undefined, hasProof: r.proofKey !== null, isOverdue: r.status === "PENDING" && r.dueAt.getTime() < now }));
}

/** The shop owner attaches the transfer proof they uploaded. Moves the refund to review. Nothing is marked paid yet. */
export async function submitRefundProof(actor: Actor, refundId: string, uploadId: string): Promise<RefundResult> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  if (typeof uploadId !== "string" || uploadId.length < 8 || uploadId.length > 64) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const refund = await tx.refund.findFirst({ where: { id: refundId, order: { merchant: { ownerId: actor.id } } }, include: { order: true } }); // owner-scoped
    if (!refund) throw new NotFoundError();
    if (refund.status !== "PENDING") fail("WRONG_STATE");
    const upload = await tx.receiptUpload.findFirst({ where: { id: uploadId, orderId: refund.orderId, uploaderId: actor.id, usedAt: null } });
    if (!upload) return fail("INVALID_REQUEST");
    const claimed = await tx.receiptUpload.updateMany({ where: { id: upload.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) fail("CONFLICT");
    const moved = await tx.refund.updateMany({ where: { id: refund.id, status: "PENDING" }, data: { status: "UNDER_REVIEW", proofKey: upload.storageKey } });
    if (moved.count !== 1) fail("CONFLICT");
    await tx.order.updateMany({ where: { id: refund.orderId }, data: { refundStatus: "UNDER_REVIEW" } });
    await tx.orderEvent.create({ data: { orderId: refund.orderId, field: "refundStatus", fromValue: "PENDING", toValue: "UNDER_REVIEW", actorId: actor.id, note: "refund proof submitted" } });
    await writeAudit({ actorId: actor.id, action: "REFUND_PROOF_SUBMITTED", entityType: "Refund", entityId: refund.id, after: { uploadId, late: refund.dueAt.getTime() < Date.now() } }, tx);
  });
}

/**
 * Admin review (needs refunds.verify). VERIFY marks the refund COMPLETED: this records that an authorized person checked
 * the proof; the platform itself never moves money. REJECT_PROOF sends it back to PENDING with a reason for the merchant.
 */
export async function reviewRefund(actor: Actor, refundId: string, decision: "VERIFY" | "REJECT_PROOF", note?: string): Promise<RefundResult> {
  if (!hasPermission(actor, "refunds.verify")) throw new AuthorizationError();
  const clean = note?.trim() ?? "";
  if (decision === "REJECT_PROOF" && (clean.length < 3 || clean.length > 300)) return { ok: false, error: "INVALID_REQUEST" };
  return run(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { order: { include: { merchant: true } } } });
    if (!refund) throw new NotFoundError();
    if (refund.status !== "UNDER_REVIEW") fail("WRONG_STATE");
    const to = decision === "VERIFY" ? "COMPLETED" : "PENDING";
    const moved = await tx.refund.updateMany({
      where: { id: refund.id, status: "UNDER_REVIEW" },
      data: decision === "VERIFY" ? { status: "COMPLETED", verifiedById: actor.id, verifiedAt: new Date(), decisionNote: clean || null } : { status: "PENDING", proofKey: null, decisionNote: clean },
    });
    if (moved.count !== 1) fail("CONFLICT");
    await tx.order.updateMany({ where: { id: refund.orderId }, data: { refundStatus: to } });
    await tx.orderEvent.create({ data: { orderId: refund.orderId, field: "refundStatus", fromValue: "UNDER_REVIEW", toValue: to, actorId: actor.id, note: clean || null } });
    const stamp = `${refund.id}:${decision}:${Date.now()}`;
    await notifyInTx(
      tx,
      decision === "VERIFY"
        ? { userId: refund.order.customerId, type: "REFUND_COMPLETED", title: "تم رد المبلغ", body: `تم توثيق رد مبلغ الطلب رقم ${refund.order.number}.`, data: { orderId: refund.orderId }, dedupeKey: `refund-completed:${refund.id}` }
        : { userId: refund.order.merchant.ownerId, type: "REFUND_PROOF_REJECTED", title: "إثبات الرد مرفوض", body: `رُفض إثبات رد الطلب رقم ${refund.order.number}: ${clean}. أرسل إثباتًا جديدًا.`, data: { orderId: refund.orderId }, dedupeKey: `refund-proof-rejected:${stamp}` },
    );
    await writeAudit({ actorId: actor.id, action: decision === "VERIFY" ? "REFUND_VERIFIED" : "REFUND_PROOF_REJECTED", entityType: "Refund", entityId: refund.id, after: { note: clean } }, tx);
  });
}

/** Tells every admin who can verify refunds about refunds past their deadline, once per refund. Stateless and idempotent. */
export async function escalateOverdueRefunds(now = new Date()): Promise<{ escalated: number }> {
  const overdue = await db.refund.findMany({ where: { status: "PENDING", dueAt: { lt: now } }, include: { order: true }, take: 200 });
  if (overdue.length === 0) return { escalated: 0 };
  const admins = await db.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE", OR: [{ isSuperAdmin: true }, { admin: { some: { permission: "refunds.verify" } } }] },
    select: { id: true },
  });
  let escalated = 0;
  for (const refund of overdue) {
    await db.$transaction(async (tx) => {
      await notifyInTx(tx, ...admins.map((a) => ({ userId: a.id, type: "REFUND_OVERDUE", title: "رد مبلغ متأخر", body: `تأخر التاجر في رد مبلغ الطلب رقم ${refund.order.number}. تابع الأمر.`, data: { refundId: refund.id, orderId: refund.orderId }, dedupeKey: `refund-overdue:${refund.id}:${a.id}` })));
    });
    escalated += 1;
  }
  return { escalated };
}
