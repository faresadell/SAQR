import "server-only";
import { db } from "@/lib/db";
import { cairoDayKey, cairoMonthBounds, cairoMonthKey, dailyChargeDecision, ledgerKeys, rewardsDue } from "@/lib/stars/rules";
import { notifyInTx } from "@/server/notifications/service";
import { applyStarMove } from "@/server/stars/ledger";

const PAGE = 200;

export interface JobSummary {
  processed: number;
  applied: number;
  skipped: number;
  failed: number;
}

/**
 * One star per day from every ACTIVE customer, driver and APPROVED-shop merchant owner (never admins), by Cairo calendar day.
 * Safe to run many times a day or to re-run after a crash: the ledger key `daily:<user>:<day>` makes each user charge once.
 * A zero balance is skipped (no debt, no automatic suspension: approved rule).
 */
export async function runDailyStarCharge(now = new Date()): Promise<JobSummary> {
  const day = cairoDayKey(now);
  const summary: JobSummary = { processed: 0, applied: 0, skipped: 0, failed: 0 };
  let cursor: string | undefined;
  for (;;) {
    const users = await db.user.findMany({
      where: {
        status: "ACTIVE",
        role: { in: ["CUSTOMER", "DRIVER", "MERCHANT"] },
        OR: [{ role: { not: "MERCHANT" } }, { merchant: { is: { status: "APPROVED" } } }],
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;
    for (const user of users) {
      summary.processed += 1;
      try {
        await db.$transaction(async (tx) => {
          const account = await tx.starAccount.findUnique({ where: { userId: user.id } });
          if (dailyChargeDecision(account?.balance ?? 0) === "SKIP_INSUFFICIENT") {
            summary.skipped += 1;
            return;
          }
          const result = await applyStarMove(tx, { userId: user.id, amount: -1, reason: "DAILY_CHARGE", idempotencyKey: ledgerKeys.daily(user.id, day), note: day });
          if (result.applied) summary.applied += 1;
          else summary.skipped += 1;
        });
      } catch {
        summary.failed += 1; // one bad account never stops the run; it is retried on the next run
      }
    }
    cursor = users[users.length - 1]?.id;
    if (users.length < PAGE) break;
  }
  return summary;
}

/**
 * Monthly customer rewards (5 orders = 15, 10 = +25, 20 = +40). "Completed" = a suborder that reached DELIVERED during the Cairo month.
 * Cancelled / rejected suborders never count. Each tier is granted once per customer per month (ledger key), so re-running is harmless.
 * The current and the previous month are both processed, so deliveries at month end are not lost by job timing.
 */
export async function runMonthlyRewards(now = new Date()): Promise<JobSummary> {
  const summary: JobSummary = { processed: 0, applied: 0, skipped: 0, failed: 0 };
  const thisMonth = cairoMonthBounds(now);
  const prevMonth = cairoMonthBounds(new Date(thisMonth.start.getTime() - 3_600_000));
  for (const { start, end } of [prevMonth, thisMonth]) {
    const monthKey = cairoMonthKey(start);
    const counts = await db.$queryRaw<{ customerId: string; completed: number }[]>`
      SELECT o."customerId", COUNT(DISTINCT o."id")::int AS completed
      FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId"
      WHERE e."field" = 'orderStatus' AND e."toValue" = 'DELIVERED' AND e."createdAt" >= ${start} AND e."createdAt" < ${end}
      GROUP BY o."customerId"`;
    for (const row of counts) {
      summary.processed += 1;
      try {
        await db.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { id: row.customerId } });
          if (!user || user.status !== "ACTIVE" || user.role !== "CUSTOMER") {
            summary.skipped += 1;
            return;
          }
          const granted = await tx.starLedgerEntry.findMany({
            where: { reason: "MONTHLY_REWARD", idempotencyKey: { startsWith: `reward:${row.customerId}:${monthKey}:` } },
            select: { idempotencyKey: true },
          });
          const grantedTiers = new Set(granted.map((g) => Number(g.idempotencyKey.split(":").pop())));
          for (const tier of rewardsDue(row.completed, grantedTiers)) {
            const result = await applyStarMove(tx, { userId: row.customerId, amount: tier.stars, reason: "MONTHLY_REWARD", idempotencyKey: ledgerKeys.monthlyReward(row.customerId, monthKey, tier.tier), note: `${monthKey} tier ${tier.tier}` });
            if (result.applied) summary.applied += 1;
          }
        });
      } catch {
        summary.failed += 1;
      }
    }
  }
  return summary;
}

/**
 * Plan reminders: a notice 3 days before the paid time ends and another when it ends. Each is sent once per expiry
 * (dedupe key + marker columns), so the job can run as often as you like. Stars are never touched here.
 */
export async function runPlanReminders(now = new Date()): Promise<JobSummary> {
  const summary: JobSummary = { processed: 0, applied: 0, skipped: 0, failed: 0 };
  const soon = await db.subscription.findMany({ where: { reminderSentAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + 3 * 86_400_000) } }, take: 500 });
  const ended = await db.subscription.findMany({ where: { expiredNotifiedAt: null, expiresAt: { lte: now } }, take: 500 });
  for (const sub of [...soon.map((s) => ({ s, kind: "SOON" as const })), ...ended.map((s) => ({ s, kind: "ENDED" as const }))]) {
    summary.processed += 1;
    try {
      await db.$transaction(async (tx) => {
        const stamp = sub.s.expiresAt.toISOString();
        if (sub.kind === "SOON") {
          const claimed = await tx.subscription.updateMany({ where: { id: sub.s.id, reminderSentAt: null, expiresAt: sub.s.expiresAt }, data: { reminderSentAt: now } });
          if (claimed.count !== 1) return;
          await notifyInTx(tx, { userId: sub.s.userId, type: "PLAN_EXPIRING", title: "باقتك على وشك الانتهاء", body: `تنتهي باقتك بتاريخ ${stamp.slice(0, 10)}. جدّد مبكرًا وتُضاف المدة المتبقية.`, dedupeKey: `plan-expiring:${sub.s.userId}:${stamp}` });
        } else {
          const claimed = await tx.subscription.updateMany({ where: { id: sub.s.id, expiredNotifiedAt: null, expiresAt: sub.s.expiresAt }, data: { expiredNotifiedAt: now } });
          if (claimed.count !== 1) return;
          await notifyInTx(tx, { userId: sub.s.userId, type: "PLAN_EXPIRED", title: "انتهت باقتك", body: "انتهت مدة باقتك. نجومك المتبقية محفوظة، ويمكنك التجديد في أي وقت.", dedupeKey: `plan-expired:${sub.s.userId}:${stamp}` });
        }
        summary.applied += 1;
      });
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
