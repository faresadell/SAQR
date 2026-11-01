import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/server/errors";
import { cairoMonthBounds, cairoMonthKey, DEFAULT_REWARD_TIERS } from "@/lib/stars/rules";

export interface MyRewards {
  monthKey: string;
  monthStart: Date;
  completedOrders: number;
  tiers: { threshold: number; rewardStars: number; granted: boolean }[];
  totalGrantedStars: number;
}

/**
 * Read-only view of this month's progress for the signed-in customer. Uses the same definition as the monthly job
 * (a sub-order that reached DELIVERED this Cairo month) and reads the grants the job actually recorded.
 */
export async function getMyRewards(actor: Actor, now = new Date()): Promise<MyRewards> {
  if (actor.role !== "CUSTOMER") throw new AuthorizationError();
  const { start, end } = cairoMonthBounds(now);
  const monthKey = cairoMonthKey(start);
  const [counts, granted] = await Promise.all([
    db.$queryRaw<{ completed: number }[]>`
      SELECT COUNT(DISTINCT o."id")::int AS completed
      FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId"
      WHERE o."customerId" = ${actor.id} AND e."field" = 'orderStatus' AND e."toValue" = 'DELIVERED' AND e."createdAt" >= ${start} AND e."createdAt" < ${end}`,
    db.starLedgerEntry.findMany({ where: { reason: "MONTHLY_REWARD", idempotencyKey: { startsWith: `reward:${actor.id}:${monthKey}:` } }, select: { idempotencyKey: true, amount: true } }),
  ]);
  const grantedTiers = new Set(granted.map((g) => Number(g.idempotencyKey.split(":").pop())));
  return {
    monthKey,
    monthStart: start,
    completedOrders: counts[0]?.completed ?? 0,
    tiers: DEFAULT_REWARD_TIERS.map((t) => ({ threshold: t.completedOrders, rewardStars: t.stars, granted: grantedTiers.has(t.tier) })),
    totalGrantedStars: granted.reduce((n, g) => n + g.amount, 0),
  };
}
