import { describe, expect, it } from "vitest";
import { canBuyTier, DEFAULT_MEMBERSHIP_PLANS, FALLBACK_TIER } from "./rules";

describe("membership rules", () => {
  it("matches the agreed prices and the agreed commission tiers", () => {
    const by = Object.fromEntries(DEFAULT_MEMBERSHIP_PLANS.map((p) => [p.code, p]));
    expect(by["plus"]!.priceCents).toBe(3000);
    expect(by["premium"]!.priceCents).toBe(6000);
    expect(by["premium"]!.tier).toBe("BUSINESS");
    expect(by["plus"]!.tier).toBe("REGULAR");
    expect(FALLBACK_TIER).toBe("REGULAR");
  });
  it("never lets an active Premium be replaced by a lower tier", () => {
    expect(canBuyTier(null, "REGULAR")).toBe(true);
    expect(canBuyTier("REGULAR", "BUSINESS")).toBe(true);
    expect(canBuyTier("BUSINESS", "BUSINESS")).toBe(true);
    expect(canBuyTier("BUSINESS", "REGULAR")).toBe(false);
  });
});
