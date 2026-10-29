import { describe, expect, it } from "vitest";
import { addMoney, applyBasisPoints, assertPiasters, formatEgp, MoneyError, parseEgp } from "./money";

describe("parseEgp", () => {
  it("parses whole and decimal amounts exactly", () => {
    expect(parseEgp("0")).toBe(0);
    expect(parseEgp("30")).toBe(3000);
    expect(parseEgp("125.5")).toBe(12550);
    expect(parseEgp("0.07")).toBe(7);
    expect(parseEgp("19.99")).toBe(1999);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "-5", "1.234", "1,5", "abc", "1e3", " ", "12.", ".5"]) {
      expect(() => parseEgp(bad)).toThrow(MoneyError);
    }
  });
});

describe("applyBasisPoints", () => {
  it("computes the 8% and 5% commission rates exactly", () => {
    expect(applyBasisPoints(10_000, 800)).toBe(800); // 100 EGP * 8%
    expect(applyBasisPoints(10_000, 500)).toBe(500); // 100 EGP * 5%
  });

  it("rounds half up on piaster boundaries", () => {
    expect(applyBasisPoints(1_050, 500)).toBe(53); // 52.5 -> 53
    expect(applyBasisPoints(1, 800)).toBe(0);
  });

  it("rejects invalid rates and amounts", () => {
    expect(() => applyBasisPoints(100, -1)).toThrow(MoneyError);
    expect(() => applyBasisPoints(100, 10_001)).toThrow(MoneyError);
    expect(() => applyBasisPoints(1.5, 500)).toThrow(MoneyError);
  });
});

describe("addMoney / assertPiasters", () => {
  it("adds integers and rejects floats", () => {
    expect(addMoney(100, 250, 5)).toBe(355);
    expect(() => addMoney(0.1, 0.2)).toThrow(MoneyError);
    expect(() => assertPiasters(Number.NaN)).toThrow(MoneyError);
    expect(() => assertPiasters(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });
});

describe("formatEgp", () => {
  it("formats for display", () => {
    expect(formatEgp(12_550, "en-US")).toContain("125.50");
  });
});
