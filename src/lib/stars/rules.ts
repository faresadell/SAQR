// Star business rules as pure functions. Amounts that the business may change (charge per order, minimum balance,
// prices) come from settings / plan rows; the tables below are only the seed defaults taken from the master spec.

import { parseCairoLocal } from "../cairo-time";

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

/** First instant of the Cairo month containing `at`, and of the next month. */
export function cairoMonthBounds(at: Date): { start: Date; end: Date } {
  const key = cairoMonthKey(at); // YYYY-MM
  const [y, m] = key.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const start = parseCairoLocal(`${key}-01T00:00`);
  const end = parseCairoLocal(`${next}-01T00:00`);
  if (!start || !end) throw new Error("Invalid month bounds");
  return { start, end };
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

/**
 * The ONE source of truth for star packages: 30, 50 and 100 stars, one star = 1 EGP, no bonus (nothing else is specified).
 * Every audience (customer, driver, merchant) buys from the same three sizes. Admins can edit prices/stars afterwards;
 * purchases keep their own snapshot. offerQuota is null: the offer quota per package has not been decided.
 * Older plans (customer_bronze ... merchant_gold) are deactivated by a migration, never deleted.
 */
export const STAR_PACKAGE_SIZES = [30, 50, 100] as const;
const AUDIENCES: readonly PlanAudience[] = ["CUSTOMER", "DRIVER", "MERCHANT"];
export const DEFAULT_PLANS: readonly PlanDefinition[] = AUDIENCES.flatMap((audience) =>
  STAR_PACKAGE_SIZES.map((stars) => ({
    code: `${audience.toLowerCase()}_stars_${stars}`,
    audience,
    priceCents: stars * 100,
    baseStars: stars,
    bonusStars: 0,
    offerQuota: null,
  })),
);
/** Codes of the retired star plans: kept in the database (history) but not sold. */
export const RETIRED_PLAN_CODES = ["customer_bronze", "customer_silver", "customer_gold", "driver_basic", "merchant_bronze", "merchant_silver", "merchant_gold"] as const;

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
