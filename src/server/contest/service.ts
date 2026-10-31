import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { cairoMonthBounds } from "@/lib/stars/rules";
import { MONTH_KEY_PATTERN } from "@/lib/settlements/calc";
import { getSetting } from "@/lib/settings";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { notifyInTx } from "@/server/notifications/service";

/**
 * Monthly contest. Prizes (1000 / 500 / 250 EGP) are settings. The RANKING RULE, eligibility and tie handling have NOT been
 * decided, so the system does not compute a ranking: an admin proposes the winners for a CLOSED month and must state the basis,
 * another step (approve) confirms, and the payout is recorded once with a reference. Every step is audited.
 */
export type ContestError = "INVALID_REQUEST" | "MONTH_NOT_CLOSED" | "USER_NOT_ELIGIBLE" | "RANK_TAKEN" | "ALREADY_RANKED" | "WRONG_STATE";
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
