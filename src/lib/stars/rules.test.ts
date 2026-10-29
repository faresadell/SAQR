import { describe, expect, it } from "vitest";
import { cairoDayKey, cairoMonthBounds, cairoMonthKey, computeNewExpiry, DEFAULT_PLANS, DEFAULT_REWARD_TIERS, dailyChargeDecision, ledgerKeys, meetsMinimumBalance, renewalReminderAt, rewardsDue, totalStars } from "./rules";

describe("Cairo day and month keys", () => {
  it("uses the Cairo calendar, not UTC", () => {
    // 22:30 UTC on 30 Jun is already 1 Jul in Cairo (UTC+3 in summer, UTC+2 in winter: both cross midnight).
    expect(cairoDayKey(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
    expect(cairoDayKey(new Date("2026-06-30T20:30:00Z"))).toBe("2026-06-30");
    expect(cairoMonthKey(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07");
    expect(cairoDayKey(new Date("2026-01-15T21:59:00Z"))).toBe("2026-01-15");
    expect(cairoDayKey(new Date("2026-01-15T22:00:00Z"))).toBe("2026-01-16");
  });
});

describe("ledger keys", () => {
  it("are deterministic so retries collide on the unique index", () => {
    expect(ledgerKeys.daily("u1", "2026-10-29")).toBe(ledgerKeys.daily("u1", "2026-10-29"));
    expect(ledgerKeys.daily("u1", "2026-10-29")).not.toBe(ledgerKeys.daily("u1", "2026-10-30"));
    expect(ledgerKeys.orderCharge("u1", "o1")).not.toBe(ledgerKeys.orderRefund("u1", "o1"));
  });
});

describe("balances", () => {
  it("minimum balance gate", () => {
    expect(meetsMinimumBalance(5, 5)).toBe(true);
    expect(meetsMinimumBalance(4, 5)).toBe(false);
  });
  it("daily charge never goes negative", () => {
    expect(dailyChargeDecision(1)).toBe("CHARGE");
    expect(dailyChargeDecision(0)).toBe("SKIP_INSUFFICIENT");
  });
});

describe("monthly rewards", () => {
  it("grants each tier once; totals 80 at 20 orders", () => {
    expect(rewardsDue(4, new Set()).length).toBe(0);
    expect(rewardsDue(5, new Set()).map((t) => t.stars)).toEqual([15]);
    expect(rewardsDue(12, new Set([1])).map((t) => t.stars)).toEqual([25]);
    const all = rewardsDue(20, new Set());
    expect(all.reduce((s, t) => s + t.stars, 0)).toBe(80);
    expect(rewardsDue(25, new Set([1, 2, 3])).length).toBe(0);
    expect(DEFAULT_REWARD_TIERS.length).toBe(3);
  });
});

describe("plans", () => {
  it("match the spec totals", () => {
    const by = Object.fromEntries(DEFAULT_PLANS.map((x) => [x.code, x]));
    expect(totalStars(by["customer_bronze"]!)).toBe(50);
    expect(totalStars(by["customer_silver"]!)).toBe(90);
    expect(totalStars(by["customer_gold"]!)).toBe(125);
    expect(totalStars(by["driver_basic"]!)).toBe(35);
    expect(totalStars(by["merchant_bronze"]!)).toBe(115);
    expect(totalStars(by["merchant_silver"]!)).toBe(175);
    expect(totalStars(by["merchant_gold"]!)).toBe(235);
    expect(by["merchant_gold"]!.offerQuota).toBe(8);
    expect(by["customer_gold"]!.priceCents).toBe(10000);
  });
  it("early renewal keeps remaining time; lapsed starts now", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    const in10 = new Date("2026-11-08T10:00:00Z");
    expect(computeNewExpiry(now, in10).toISOString()).toBe("2026-12-08T10:00:00.000Z");
    expect(computeNewExpiry(now, new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2026-11-28T10:00:00.000Z");
    expect(computeNewExpiry(now, null).toISOString()).toBe("2026-11-28T10:00:00.000Z");
    expect(renewalReminderAt(in10).toISOString()).toBe("2026-11-05T10:00:00.000Z");
  });
});

describe("cairoMonthBounds", () => {
  it("covers exactly the Cairo month, including the DST shift", () => {
    const oct = cairoMonthBounds(new Date("2026-10-29T10:00:00Z"));
    expect(cairoDayKey(oct.start)).toBe("2026-10-01");
    expect(cairoDayKey(new Date(oct.end.getTime() - 1))).toBe("2026-10-31");
    expect(cairoDayKey(oct.end)).toBe("2026-11-01");
    const dec = cairoMonthBounds(new Date("2026-12-15T10:00:00Z"));
    expect(cairoDayKey(dec.end)).toBe("2027-01-01");
    // a delivery at 23:30 Cairo on the last day belongs to that month
    expect(cairoMonthKey(new Date(oct.end.getTime() - 30 * 60_000))).toBe("2026-10");
  });
});
