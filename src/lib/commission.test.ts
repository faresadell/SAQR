import { describe, expect, it } from "vitest";
import { COMMISSION_MAX_BASIS_POINTS, computeCommission, formatPercent, parsePercentToBasisPoints } from "./commission";

describe("agreed commission rates", () => {
  it("charges 8% for Basic merchants", () => {
    const snap = computeCommission(10_000, 800);
    expect(snap.commissionBp).toBe(800);
    expect(snap.commissionBaseCents).toBe(10_000);
    expect(snap.commissionCents).toBe(800);
  });

  it("charges 5% for Premium merchants", () => {
    const snap = computeCommission(10_000, 500);
    expect(snap.commissionBp).toBe(500);
    expect(snap.commissionCents).toBe(500);
  });

  it("is exact on piaster boundaries (round half up) and on odd amounts", () => {
    expect(computeCommission(1_050, 500).commissionCents).toBe(53); // 52.5 -> 53
    expect(computeCommission(25_000, 800).commissionCents).toBe(2_000);
    expect(computeCommission(0, 800).commissionCents).toBe(0);
  });

  it("rejects rates outside the allowed range", () => {
    for (const bad of [-1, COMMISSION_MAX_BASIS_POINTS + 1, 7.5, Number.NaN]) {
      expect(() => computeCommission(10_000, bad)).toThrow();
    }
  });

  it("applies to the product amount only: a delivery fee is never part of the base", () => {
    const productCents = 20_000;
    const deliveryFeeCents = 3_000;
    const snap = computeCommission(productCents, 800); // caller passes the product value
    const wrong = computeCommission(productCents + deliveryFeeCents, 800);
    expect(snap.commissionCents).toBe(1_600);
    expect(snap.commissionCents === wrong.commissionCents).toBe(false);
  });
});

describe("percent input", () => {
  it("converts percentages to basis points exactly", () => {
    expect(parsePercentToBasisPoints("8")).toBe(800);
    expect(parsePercentToBasisPoints("5")).toBe(500);
    expect(parsePercentToBasisPoints("7.5")).toBe(750);
    expect(parsePercentToBasisPoints("7.25")).toBe(725);
    expect(parsePercentToBasisPoints("٨")).toBe(800);
    expect(parsePercentToBasisPoints("7,5")).toBe(750);
    expect(parsePercentToBasisPoints("0")).toBe(0);
    expect(parsePercentToBasisPoints("50")).toBe(5000);
  });

  it("returns null for bad input", () => {
    for (const bad of ["", "abc", "8.555", "-1", "50.01", "51", "8%", "1e1"]) {
      expect(parsePercentToBasisPoints(bad)).toBeNull();
    }
  });

  it("formats basis points back to text", () => {
    expect(formatPercent(800)).toBe("8");
    expect(formatPercent(750)).toBe("7.5");
    expect(formatPercent(725)).toBe("7.25");
    expect(formatPercent(0)).toBe("0");
  });
});
