import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";

export type ComplaintError = "INVALID_REQUEST" | "RATE_LIMITED" | "WRONG_STATE";
export type ComplaintResult<T = object> = ({ ok: true } & T) | { ok: false; error: ComplaintError };

/** The customer files a complaint about one of THEIR suborders. The shop is told; admins review. Refunds stay in the refund flow. */
export async function fileComplaint(actor: Actor, input: { orderId: string; subject: string; details: string }): Promise<ComplaintResult<{ complaintId: string }>> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  if (subject.length < 3 || subject.length > 100 || details.length < 10 || details.length > 1000) return { ok: false, error: "INVALID_REQUEST" };
  const order = await db.order.findFirst({ where: { id: String(input.orderId), customerId: actor.id }, include: { merchant: true } }); // owner-scoped
  if (!order) throw new NotFoundError();
  if (!(await consumeRateLimit(`complaint:${actor.id}`, 10, 86_400))) return { ok: false, error: "RATE_LIMITED" }; // technical abuse guard
  return db.$transaction(async (tx) => {
    const row = await tx.complaint.create({ data: { orderId: order.id, customerId: actor.id, merchantId: order.merchantId, subject, details } });
    await notifyInTx(tx, { userId: order.merchant.ownerId, type: "COMPLAINT_FILED", title: "شكوى على أحد طلباتك", body: `وصلت شكوى على الطلب رقم ${order.number}: ${subject}.`, data: { orderId: order.id, complaintId: row.id }, dedupeKey: `complaint-filed:${row.id}` });
    await writeAudit({ actorId: actor.id, action: "COMPLAINT_FILED", entityType: "Complaint", entityId: row.id, after: { orderId: order.id } }, tx);
    return { ok: true as const, complaintId: row.id };
  });
}

export async function listMyComplaints(actor: Actor) {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  return db.complaint.findMany({ where: { customerId: actor.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, orderId: true, subject: true, status: true, adminResponse: true, createdAt: true, handledAt: true } });
}

export async function listComplaintsForAdmin(actor: Actor, status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED") {
  if (!hasPermission(actor, "complaints.manage")) throw new AuthorizationError();
  return db.complaint.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 200 });
}

const NEXT: Record<string, readonly string[]> = { OPEN: ["IN_REVIEW", "RESOLVED", "DISMISSED"], IN_REVIEW: ["RESOLVED", "DISMISSED"], RESOLVED: [], DISMISSED: [] };

/** Admin moves a complaint forward. RESOLVED and DISMISSED need a response the customer will read. */
export async function handleComplaint(actor: Actor, complaintId: string, to: "IN_REVIEW" | "RESOLVED" | "DISMISSED", response?: string): Promise<ComplaintResult> {
  if (!hasPermission(actor, "complaints.manage")) throw new AuthorizationError();
  const text = response?.trim() ?? "";
  if (text.length > 1000 || (to !== "IN_REVIEW" && text.length < 5)) return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx): Promise<ComplaintResult> => {
    const row = await tx.complaint.findUnique({ where: { id: complaintId } });
    if (!row) throw new NotFoundError();
    if (!NEXT[row.status]?.includes(to)) return { ok: false, error: "WRONG_STATE" };
    const changed = await tx.complaint.updateMany({ where: { id: complaintId, status: row.status }, data: { status: to, handledById: actor.id, handledAt: new Date(), ...(text ? { adminResponse: text } : {}) } }); // compare-and-set
    if (changed.count !== 1) return { ok: false, error: "WRONG_STATE" };
    await notifyInTx(tx, { userId: row.customerId, type: "COMPLAINT_UPDATED", title: "تحديث على شكواك", body: to === "IN_REVIEW" ? "شكواك قيد المراجعة." : `تم الرد على شكواك: ${text}`, data: { complaintId }, dedupeKey: `complaint-${to.toLowerCase()}:${complaintId}` });
    await writeAudit({ actorId: actor.id, action: "COMPLAINT_HANDLED", entityType: "Complaint", entityId: complaintId, before: { status: row.status }, after: { status: to } }, tx);
    return { ok: true };
  });
}
