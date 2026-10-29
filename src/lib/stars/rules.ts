// Star business rules as pure functions. Amounts that the business may change (charge per order, minimum balance,
// prices) come from settings / plan rows; the tables below are only the seed defaults taken from the master spec.

const CAIRO = "Africa/Cairo";

/** "YYYY-MM-DD" of the Cairo calendar day containing `at`. Used as the once-per-day key. */
export function cairoDayKey(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CAIRO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "YYYY-MM" of the Cairo month containing `at`. */
export function cairoMonthKey(at: Date): string {
  return cairoDayKey(at).slice(0, 7);
}

/** Ledger idempotency keys: the same logical event always produces the same key, so a retry hits the unique index. */
export const ledgerKeys = {
  daily: (userId: string, dayKey: string) => `daily:${userId}:${dayKey}`,
  orderCharge: (userId: string, orderId: string) => `order-charge:${userId}:${orderId}`,
  orderRefund: (userId: string, orderId: string) => `order-refund:${userId}:${orderId}`,
  planGrant: (userId: string, subscriptionId: string, part: "base" | "bonus") => `plan:${userId}:${subscriptionId}:${part}`,
  monthlyReward: (userId: string, monthKey: string, tier: number) => `reward:${userId}:${monthKey}:${tier}`,
};

export function meetsMinimumBalance(balance: number, minimum: number): boolean {
  return Number.isInteger(balance) && balance >= minimum;
}

export type DailyChargeDecision = "CHARGE" | "SKIP_INSUFFICIENT";

/** One star per day. Never goes below zero; what to do with a zero balance is an open business decision (docs/PHASE4.md). */
export function dailyChargeDecision(balance: number, amount = 1): DailyChargeDecision {
  return balance >= amount ? "CHARGE" : "SKIP_INSUFFICIENT";
}

// ───── monthly customer rewards (spec 3.7) ─────
export interface RewardTier {
  tier: number;
  completedOrders: number;
  stars: number;
}

export const DEFAULT_REWARD_TIERS: readonly RewardTier[] = [
  { tier: 1, completedOrders: 5, stars: 15 },
  { tier: 2, completedOrders: 10, stars: 25 },
  { tier: 3, completedOrders: 20, stars: 40 },
];

/** Tiers reached but not yet granted this month. Each tier is granted at most once (cumulative total at 20 orders = 80). */
export function rewardsDue(completedOrders: number, grantedTiers: ReadonlySet<number>, tiers: readonly RewardTier[] = DEFAULT_REWARD_TIERS): RewardTier[] {
  return tiers.filter((t) => completedOrders >= t.completedOrders && !grantedTiers.has(t.tier));
}

// ───── plans (spec 3.1 - 3.4) ─────
export type PlanAudience = "CUSTOMER" | "DRIVER" | "MERCHANT";

export interface PlanDefinition {
  code: string;
  audience: PlanAudience;
  priceCents: number;
  baseStars: number;
  bonusStars: number;
  /** Merchant offer quota per cycle; null for audiences without offers. */
  offerQuota: number | null;
}

export const DEFAULT_PLANS: readonly PlanDefinition[] = [
  { code: "customer_bronze", audience: "CUSTOMER", priceCents: 5000, baseStars: 50, bonusStars: 0, offerQuota: null },
  { code: "customer_silver", audience: "CUSTOMER", priceCents: 7500, baseStars: 75, bonusStars: 15, offerQuota: null },
  { code: "customer_gold", audience: "CUSTOMER", priceCents: 10000, baseStars: 100, bonusStars: 25, offerQuota: null },
  { code: "driver_basic", audience: "DRIVER", priceCents: 3000, baseStars: 35, bonusStars: 0, offerQuota: null },
  { code: "merchant_bronze", audience: "MERCHANT", priceCents: 10000, baseStars: 100, bonusStars: 15, offerQuota: 4 },
  { code: "merchant_silver", audience: "MERCHANT", priceCents: 15000, baseStars: 150, bonusStars: 25, offerQuota: 6 },
  { code: "merchant_gold", audience: "MERCHANT", priceCents: 20000, baseStars: 200, bonusStars: 35, offerQuota: 8 },
];

export const PLAN_CYCLE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * New expiry after an approved payment. Early renewal keeps the remaining time (the new cycle is added after the old
 * expiry); a lapsed or first-time plan starts now.
 */
export function computeNewExpiry(now: Date, currentExpiresAt: Date | null, cycleDays = PLAN_CYCLE_DAYS): Date {
  const start = currentExpiresAt && currentExpiresAt.getTime() > now.getTime() ? currentExpiresAt : now;
  return new Date(start.getTime() + cycleDays * DAY_MS);
}

export function totalStars(plan: Pick<PlanDefinition, "baseStars" | "bonusStars">): number {
  return plan.baseStars + plan.bonusStars;
}

/** Notification moments: three days before expiry, and at expiry. */
export function renewalReminderAt(expiresAt: Date, daysBefore = 3): Date {
  return new Date(expiresAt.getTime() - daysBefore * DAY_MS);
}
