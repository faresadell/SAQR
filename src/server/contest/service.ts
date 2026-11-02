import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { rankStandings, type ContestOrderRow, type Standing } from "@/lib/contest/ranking";
import { cairoMonthBounds, cairoMonthKey } from "@/lib/stars/rules";
import { MONTH_KEY_PATTERN } from "@/lib/settlements/calc";
import { getSetting } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";

/**
 * Monthly contest. Prizes (1000 / 500 / 250 EGP) are settings. Ranking (see src/lib/contest/ranking.ts): qualifying completed
 * orders, then qualifying sales value, then who reached the result first. Standings can be previewed any time; awards can only be
 * proposed from them for a CLOSED month while the contest is switched on AND its rules page is approved. An admin can also
 * propose by hand (stating the basis) or exclude someone for manipulation. Approval and the one-time payout stay separate, audited steps.
 */
export type ContestError = "INVALID_REQUEST" | "MONTH_NOT_CLOSED" | "USER_NOT_ELIGIBLE" | "RANK_TAKEN" | "ALREADY_RANKED" | "WRONG_STATE" | "CONTEST_NOT_ENABLED" | "RULES_NOT_APPROVED" | "AWARDS_EXIST" | "NOT_ENOUGH_PARTICIPANTS";
export type ContestResult<T = object> = ({ ok: true } & T) | { ok: false; error: ContestError };

const need = (actor: Actor): void => {
  if (!hasPermission(actor, "contest.manage")) throw new AuthorizationError();
};

export async function prizeFor(rank: 1 | 2 | 3): Promise<number> {
  const egp = await getSetting(rank === 1 ? "contest.prize_first_egp" : rank === 2 ? "contest.prize_second_egp" : "contest.prize_third_egp");
  return egp * 100;
}

export interface ProposeInput {
  monthKey: string;
  rank: number;
  userId: string;
  /** Why this person holds this rank, in the admin's words (the system has no ranking rule of its own). */
  basisNote: string;
}

export async function proposeAward(actor: Actor, input: ProposeInput, now = new Date()): Promise<ContestResult<{ awardId: string }>> {
  need(actor);
  const basis = typeof input.basisNote === "string" ? input.basisNote.trim() : "";
  if (!MONTH_KEY_PATTERN.test(input.monthKey) || ![1, 2, 3].includes(input.rank) || basis.length < 10 || basis.length > 500 || typeof input.userId !== "string") return { ok: false, error: "INVALID_REQUEST" };
  const [y, m] = input.monthKey.split("-").map(Number) as [number, number];
  const { end } = cairoMonthBounds(new Date(Date.UTC(y, m - 1, 15, 12)));
  if (end.getTime() > now.getTime()) return { ok: false, error: "MONTH_NOT_CLOSED" };
  const prize = await prizeFor(input.rank as 1 | 2 | 3);
  try {
    return await db.$transaction(async (tx): Promise<ContestResult<{ awardId: string }>> => {
      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!user || user.status !== "ACTIVE" || user.role === "ADMIN") return { ok: false, error: "USER_NOT_ELIGIBLE" };
      const award = await tx.contestAward.create({ data: { monthKey: input.monthKey, rank: input.rank, userId: input.userId, prizeCents: prize, basisNote: basis, proposedById: actor.id } });
      await writeAudit({ actorId: actor.id, action: "CONTEST_AWARD_PROPOSED", entityType: "ContestAward", entityId: award.id, after: { monthKey: input.monthKey, rank: input.rank, userId: input.userId, prizeCents: prize } }, tx);
      return { ok: true, awardId: award.id };
    });
  } catch (error) {
    // Partial unique indexes (migration): one live award per rank and per person for each month.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = JSON.stringify(error.meta ?? {});
      return { ok: false, error: target.includes("userId") ? "ALREADY_RANKED" : "RANK_TAKEN" };
    }
    throw error;
  }
}

async function transition(actor: Actor, awardId: string, from: "PROPOSED" | "APPROVED", to: "APPROVED" | "REJECTED" | "PAID", data: Prisma.ContestAwardUpdateManyMutationInput, action: string, notice?: { type: string; title: string; body: string }): Promise<ContestResult> {
  return db.$transaction(async (tx): Promise<ContestResult> => {
    const award = await tx.contestAward.findUnique({ where: { id: awardId } });
    if (!award) throw new NotFoundError();
    const changed = await tx.contestAward.updateMany({ where: { id: awardId, status: from }, data: { status: to, ...data } }); // compare-and-set
    if (changed.count !== 1) return { ok: false, error: "WRONG_STATE" };
    if (notice) await notifyInTx(tx, { userId: award.userId, type: notice.type, title: notice.title, body: notice.body, data: { awardId, monthKey: award.monthKey, rank: award.rank }, dedupeKey: `${notice.type.toLowerCase()}:${awardId}` });
    await writeAudit({ actorId: actor.id, action, entityType: "ContestAward", entityId: awardId, before: { status: from }, after: { status: to } }, tx);
    return { ok: true };
  });
}

export async function approveAward(actor: Actor, awardId: string): Promise<ContestResult> {
  need(actor);
  return transition(actor, awardId, "PROPOSED", "APPROVED", { decidedById: actor.id, decidedAt: new Date() }, "CONTEST_AWARD_APPROVED", { type: "CONTEST_WINNER", title: "مبروك! فزت في المسابقة الشهرية", body: "تم اعتماد فوزك في المسابقة الشهرية. سيتواصل معك فريقنا لتسليم الجائزة." });
}

export async function rejectAward(actor: Actor, awardId: string, reason: string): Promise<ContestResult> {
  need(actor);
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (clean.length < 3 || clean.length > 300) return { ok: false, error: "INVALID_REQUEST" };
  return transition(actor, awardId, "PROPOSED", "REJECTED", { decidedById: actor.id, decidedAt: new Date(), decisionNote: clean }, "CONTEST_AWARD_REJECTED");
}

/** The prize was handed over (outside the platform). Recorded once, with a reference. */
export async function markAwardPaid(actor: Actor, awardId: string, reference: string): Promise<ContestResult> {
  need(actor);
  const ref = typeof reference === "string" ? reference.trim() : "";
  if (ref.length < 3 || ref.length > 64) return { ok: false, error: "INVALID_REQUEST" };
  return transition(actor, awardId, "APPROVED", "PAID", { paidById: actor.id, paidAt: new Date(), paymentReference: ref }, "CONTEST_AWARD_PAID", { type: "CONTEST_PAID", title: "تم صرف جائزتك", body: "تم تسجيل صرف جائزة المسابقة الشهرية." });
}

export async function listAwards(actor: Actor, monthKey?: string) {
  need(actor);
  return db.contestAward.findMany({ where: monthKey ? { monthKey } : {}, orderBy: [{ monthKey: "desc" }, { rank: "asc" }], take: 200 });
}

/** A user's own approved or paid wins (what the app shows them). */
export async function listMyAwards(actor: Actor) {
  return db.contestAward.findMany({ where: { userId: actor.id, status: { in: ["APPROVED", "PAID"] } }, orderBy: { monthKey: "desc" }, select: { monthKey: true, rank: true, prizeCents: true, status: true, paidAt: true } });
}


// ───────────── Standings (computed from real orders) ─────────────

function monthBounds(monthKey: string): { start: Date; end: Date } | null {
  if (!MONTH_KEY_PATTERN.test(monthKey)) return null;
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const b = cairoMonthBounds(new Date(Date.UTC(y, m - 1, 15, 12)));
  return cairoMonthKey(b.start) === monthKey ? b : null;
}

async function loadRows(monthKey: string): Promise<ContestOrderRow[] | null> {
  const b = monthBounds(monthKey);
  if (!b) return null;
  const delivered = await db.$queryRaw<{ orderId: string; deliveredAt: Date }[]>`SELECT e."orderId" AS "orderId", MIN(e."createdAt") AS "deliveredAt" FROM "OrderEvent" e WHERE e."field" = 'orderStatus' AND e."toValue" = 'DELIVERED' GROUP BY e."orderId" HAVING MIN(e."createdAt") >= ${b.start} AND MIN(e."createdAt") < ${b.end}`;
  if (delivered.length === 0) return [];
  const when = new Map(delivered.map((d) => [d.orderId, d.deliveredAt]));
  const ids = [...when.keys()];
  const orders = await db.order.findMany({ where: { id: { in: ids } }, select: { id: true, customerId: true, merchantId: true, totalCents: true, commissionBaseCents: true, commissionBp: true, merchant: { select: { ownerId: true } } } });
  const refunds = await db.refund.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, status: "COMPLETED" }, _sum: { amountCents: true } });
  const refunded = new Map(refunds.map((r) => [r.orderId, r._sum.amountCents ?? 0]));
  return orders.map((o) => ({ orderId: o.id, customerId: o.customerId, merchantId: o.merchantId, merchantOwnerId: o.merchant.ownerId, commissionBaseCents: o.commissionBaseCents, commissionBp: o.commissionBp, totalCents: o.totalCents, refundedCents: refunded.get(o.id) ?? 0, deliveredAt: when.get(o.id)! }));
}

async function currentRules() {
  const [minEgp, cap] = await Promise.all([getSetting("contest.min_order_subtotal_egp"), getSetting("contest.max_orders_per_shop_per_customer")]);
  return { minSubtotalCents: minEgp * 100, maxOrdersPerShop: cap };
}

export interface StandingsView {
  monthKey: string;
  closed: boolean;
  enabled: boolean;
  rulesApproved: boolean;
  rules: { minSubtotalCents: number; maxOrdersPerShop: number };
  standings: (Standing & { name: string })[];
  excluded: { userId: string; reason: string; createdAt: Date }[];
}

/** Current ranking for a month (a preview while the month is still open). Needs contest.manage. */
export async function getStandings(actor: Actor, monthKey: string, limit = 20, now = new Date()): Promise<StandingsView | null> {
  need(actor);
  const bounds = monthBounds(monthKey);
  const rows = bounds ? await loadRows(monthKey) : null;
  if (!bounds || !rows) return null;
  const [rules, exclusions, enabled, page] = await Promise.all([currentRules(), db.contestExclusion.findMany({ where: { monthKey }, orderBy: { createdAt: "asc" } }), getSetting("contest.enabled"), db.legalPage.findUnique({ where: { slug: "contest" } })]);
  const top = rankStandings(rows, rules, new Set(exclusions.map((e) => e.userId))).slice(0, Math.min(Math.max(limit, 1), 100));
  const users = await db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return { monthKey, closed: bounds.end.getTime() <= now.getTime(), enabled: enabled === 1, rulesApproved: !!page?.approvedAt, rules, standings: top.map((t) => ({ ...t, name: names.get(t.userId) ?? "" })), excluded: exclusions.map((e) => ({ userId: e.userId, reason: e.reason, createdAt: e.createdAt })) };
}

/** Removes a person from the month's ranking (manipulation, fraud). Reason is required and audited. */
export async function excludeParticipant(actor: Actor, monthKey: string, userId: string, reason: string): Promise<ContestResult> {
  need(actor);
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (!monthBounds(monthKey) || typeof userId !== "string" || clean.length < 3 || clean.length > 300) return { ok: false, error: "INVALID_REQUEST" };
  const blocked = await db.contestAward.count({ where: { monthKey, userId, status: { in: ["APPROVED", "PAID"] } } });
  if (blocked > 0) return { ok: false, error: "WRONG_STATE" }; // an approved/paid winner is handled by rejecting the award first
  return db.$transaction(async (tx): Promise<ContestResult> => {
    await tx.contestExclusion.upsert({ where: { monthKey_userId: { monthKey, userId } }, create: { monthKey, userId, reason: clean, excludedById: actor.id }, update: {} });
    await tx.contestAward.updateMany({ where: { monthKey, userId, status: "PROPOSED" }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote: `استبعاد: ${clean}` } });
    await writeAudit({ actorId: actor.id, action: "CONTEST_PARTICIPANT_EXCLUDED", entityType: "ContestExclusion", entityId: `${monthKey}:${userId}`, after: { reason: clean } }, tx);
    return { ok: true };
  });
}

export async function restoreParticipant(actor: Actor, monthKey: string, userId: string): Promise<ContestResult> {
  need(actor);
  if (!monthBounds(monthKey) || typeof userId !== "string") return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx): Promise<ContestResult> => {
    const removed = await tx.contestExclusion.deleteMany({ where: { monthKey, userId } });
    if (removed.count !== 1) return { ok: false, error: "WRONG_STATE" };
    await writeAudit({ actorId: actor.id, action: "CONTEST_PARTICIPANT_RESTORED", entityType: "ContestExclusion", entityId: `${monthKey}:${userId}` }, tx);
    return { ok: true };
  });
}

/**
 * Proposes the top three of a CLOSED month as PROPOSED awards (an admin still reviews, approves, then records the payout).
 * Refused unless the contest is switched on and its rules page is approved, and when any live award already exists for the month.
 */
export async function proposeFromStandings(actor: Actor, monthKey: string, now = new Date()): Promise<ContestResult<{ awardIds: string[] }>> {
  need(actor);
  const view = await getStandings(actor, monthKey, 3, now);
  if (!view) return { ok: false, error: "INVALID_REQUEST" };
  if (!view.closed) return { ok: false, error: "MONTH_NOT_CLOSED" };
  if (!view.enabled) return { ok: false, error: "CONTEST_NOT_ENABLED" };
  if (!view.rulesApproved) return { ok: false, error: "RULES_NOT_APPROVED" };
  if (view.standings.length === 0) return { ok: false, error: "NOT_ENOUGH_PARTICIPANTS" };
  if ((await db.contestAward.count({ where: { monthKey, status: { in: ["PROPOSED", "APPROVED", "PAID"] } } })) > 0) return { ok: false, error: "AWARDS_EXIST" };
  const awardIds: string[] = [];
  for (const s of view.standings) {
    const basis = `المركز ${s.rank}: ${s.qualifyingOrders} طلب مؤهل، مبيعات مؤهلة ${(s.qualifyingSalesCents / 100).toFixed(2)} جنيه (حسب قواعد المسابقة المعتمدة)`;
    const result = await proposeAward(actor, { monthKey, rank: s.rank, userId: s.userId, basisNote: basis }, now);
    if (!result.ok) return result;
    awardIds.push(result.awardId);
  }
  return { ok: true, awardIds };
}
