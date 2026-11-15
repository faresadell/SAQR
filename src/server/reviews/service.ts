import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";

export type ReviewError = "INVALID_REQUEST" | "RATE_LIMITED" | "NOT_DELIVERED" | "ALREADY_REVIEWED";
export type ReviewResult = { ok: true } | { ok: false; error: ReviewError };

/** The customer rates a sub-order of theirs after it was delivered. One review per sub-order; it is never edited. */
export async function createReview(actor: Actor, input: { orderId: string; rating: number; comment?: string }): Promise<ReviewResult> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || comment.length > 500) return { ok: false, error: "INVALID_REQUEST" };
  const order = await db.order.findFirst({ where: { id: String(input.orderId), customerId: actor.id }, include: { merchant: true } }); // owner-scoped
  if (!order) throw new NotFoundError();
  if (order.orderStatus !== "DELIVERED") return { ok: false, error: "NOT_DELIVERED" };
  if (!(await consumeRateLimit(`review:${actor.id}`, 20, 86_400))) return { ok: false, error: "RATE_LIMITED" };
  try {
    await db.$transaction(async (tx) => {
      const row = await tx.review.create({ data: { orderId: order.id, merchantId: order.merchantId, customerId: actor.id, rating: input.rating, comment: comment || null } });
      await notifyInTx(tx, { userId: order.merchant.ownerId, type: "REVIEW_RECEIVED", title: "تقييم جديد", body: `قيّم عميل الطلب رقم ${order.number}: ${input.rating} من 5.`, data: { orderId: order.id }, dedupeKey: `review:${row.id}` });
      await writeAudit({ actorId: actor.id, action: "REVIEW_CREATED", entityType: "Review", entityId: row.id, after: { orderId: order.id, rating: input.rating } }, tx);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: "ALREADY_REVIEWED" }; // unique orderId
    throw error;
  }
  return { ok: true };
}

/** Which of these sub-orders (the customer's own) already have a review. */
export async function reviewedOrderIds(actor: Actor, orderIds: string[]): Promise<Set<string>> {
  if (actor.role !== "CUSTOMER" || orderIds.length === 0) return new Set();
  const rows = await db.review.findMany({ where: { customerId: actor.id, orderId: { in: orderIds } }, select: { orderId: true } });
  return new Set(rows.map((r) => r.orderId));
}

export interface ShopRating {
  average: number | null;
  count: number;
}

/** Real average of the visible reviews. No reviews = no number (never a made-up one). */
export async function getShopRating(merchantId: string): Promise<ShopRating> {
  const agg = await db.review.aggregate({ where: { merchantId, isHidden: false }, _avg: { rating: true }, _count: { _all: true } });
  return { average: agg._count._all > 0 && agg._avg.rating !== null ? Math.round(agg._avg.rating * 10) / 10 : null, count: agg._count._all };
}

/** Public list: first name only, so customers are not identifiable. */
export async function listShopReviews(merchantId: string, take = 20) {
  const rows = await db.review.findMany({ where: { merchantId, isHidden: false }, orderBy: { createdAt: "desc" }, take, select: { id: true, rating: true, comment: true, createdAt: true, customerId: true } });
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.customerId) } }, select: { id: true, name: true } });
  const first = new Map(users.map((u) => [u.id, u.name.trim().split(/\s+/)[0] ?? ""]));
  return rows.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, author: first.get(r.customerId) || "عميل" }));
}

/** Admin moderation: list everything (hidden too). */
export async function listReviewsForAdmin(actor: Actor) {
  if (!hasPermission(actor, "complaints.manage")) throw new AuthorizationError();
  const rows = await db.review.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const [users, merchants] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.customerId))] } }, select: { id: true, name: true } }),
    db.merchant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.merchantId))] } }, select: { id: true, name: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, x.name]));
  const m = new Map(merchants.map((x) => [x.id, x.name]));
  return rows.map((r) => ({ ...r, customerName: u.get(r.customerId) ?? "—", merchantName: m.get(r.merchantId) ?? "—" }));
}

/** Admin hides (or restores) a review. The rating stays stored; it only stops counting and showing. */
export async function setReviewHidden(actor: Actor, reviewId: string, hidden: boolean): Promise<void> {
  if (!hasPermission(actor, "complaints.manage")) throw new AuthorizationError();
  await db.$transaction(async (tx) => {
    const row = await tx.review.findUnique({ where: { id: reviewId } });
    if (!row) throw new NotFoundError();
    await tx.review.update({ where: { id: reviewId }, data: { isHidden: hidden, hiddenById: hidden ? actor.id : null } });
    await writeAudit({ actorId: actor.id, action: hidden ? "REVIEW_HIDDEN" : "REVIEW_RESTORED", entityType: "Review", entityId: reviewId }, tx);
  });
}
