import { describe, expect, it } from "vitest";
import { adjustmentFor, retainedBase, retainedCommission, totalsOf, MONTH_KEY_PATTERN, type SettlementLineDraft } from "./calc";

const order = (over: Partial<Parameters<typeof retainedBase>[0]> = {}) => ({ commissionBaseCents: 10_000, commissionBp: 800, totalCents: 12_000, refundedCents: 0, ...over });

describe("retained commission", () => {
  it("charges the agreed rates on the full base when nothing was refunded", () => {
    expect(retainedCommission(order())).toBe(800); // 8% of 100 EGP
    expect(retainedCommission(order({ commissionBp: 500 }))).toBe(500); // 5%
  });
  it("is zero when fully refunded, reduced when partly refunded", () => {
    expect(retainedCommission(order({ refundedCents: 12_000 }))).toBe(0);
    expect(retainedCommission(order({ refundedCents: 20_000 }))).toBe(0);
    expect(retainedBase(order({ refundedCents: 2_500 }))).toBe(7_500);
    expect(retainedCommission(order({ refundedCents: 2_500 }))).toBe(600);
  });
  it("never goes negative, and uses the rate copied into the order", () => {
    expect(retainedBase(order({ refundedCents: 11_999 }))).toBe(0);
    expect(retainedCommission(order({ commissionBp: 123 }))).toBe(123); // 1.23% of 100 EGP, exact
  });
  it("rounds half up with integers only", () => {
    expect(retainedCommission({ commissionBaseCents: 1_250, commissionBp: 800, totalCents: 1_250, refundedCents: 0 })).toBe(100);
    expect(retainedCommission({ commissionBaseCents: 1_255, commissionBp: 800, totalCents: 1_255, refundedCents: 0 })).toBe(100); // 100.4 -> 100
    expect(retainedCommission({ commissionBaseCents: 1_257, commissionBp: 800, totalCents: 1_257, refundedCents: 0 })).toBe(101); // 100.56 -> 101
  });
});

describe("totals and adjustments", () => {
  const lines: SettlementLineDraft[] = [
    { orderId: "a", kind: "ORDER", baseCents: 10_000, commissionBp: 800, commissionCents: 800 },
    { orderId: "b", kind: "ORDER", baseCents: 5_000, commissionBp: 500, commissionCents: 250 },
    { orderId: "c", kind: "ADJUSTMENT", baseCents: 0, commissionBp: 800, commissionCents: -300 },
  ];
  it("adds exactly", () => {
    expect(totalsOf(lines)).toEqual({ orderCount: 2, baseCents: 15_000, commissionCents: 1_050, adjustmentCents: -300, netDueCents: 750 });
    expect(totalsOf([])).toEqual({ orderCount: 0, baseCents: 0, commissionCents: 0, adjustmentCents: 0, netDueCents: 0 });
  });
  it("refuses an adjustment that would increase the commission", () => {
    expect(() => totalsOf([{ orderId: "x", kind: "ADJUSTMENT", baseCents: 0, commissionBp: 800, commissionCents: 50 }])).toThrow();
  });
  it("adjustment is the (negative) difference after a later refund, never positive", () => {
    expect(adjustmentFor(800, order({ refundedCents: 12_000 }))).toBe(-800);
    expect(adjustmentFor(800, order({ refundedCents: 2_500 }))).toBe(-200);
    expect(adjustmentFor(800, order())).toBe(0);
  });
});

describe("month key", () => {
  it("accepts only YYYY-MM", () => {
    expect(MONTH_KEY_PATTERN.test("2026-10")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "26-10", "2026-1", "2026-10-01", ""]) expect(MONTH_KEY_PATTERN.test(bad)).toBe(false);
  });
});
