import { describe, expect, it } from "vitest";
import { appliedUnitDiscountCents, checkDiscount, unitDiscountCents } from "./discount";

describe("unit discount", () => {
  it("percent rounds down", () => {
    expect(unitDiscountCents({ type: "PERCENT", value: 1500 }, 10_000)).toBe(1_500);
    expect(unitDiscountCents({ type: "PERCENT", value: 1500 }, 999)).toBe(149); // 149.85 -> 149
    expect(unitDiscountCents({ type: "PERCENT", value: 1 }, 99)).toBe(0);
  });
  it("fixed is per unit", () => expect(unitDiscountCents({ type: "FIXED", value: 500 }, 10_000)).toBe(500));
  it("never applies a discount that would make the price zero or negative", () => {
    expect(appliedUnitDiscountCents({ type: "FIXED", value: 10_000 }, 10_000)).toBe(0);
    expect(appliedUnitDiscountCents({ type: "FIXED", value: 12_000 }, 10_000)).toBe(0);
    expect(appliedUnitDiscountCents({ type: "FIXED", value: 9_999 }, 10_000)).toBe(9_999);
    expect(appliedUnitDiscountCents({ type: "PERCENT", value: 9_000 }, 1)).toBe(0); // 0 piasters off: nothing to apply
  });
  it("rejects invalid prices", () => expect(() => unitDiscountCents({ type: "FIXED", value: 1 }, -1)).toThrow());
});

describe("checkDiscount", () => {
  const limits = { maxPercent: 30, maxFixedCents: 10_000 };
  it("accepts values inside the limits", () => {
    expect(checkDiscount({ type: "PERCENT", value: 3000 }, [5000, 10_000], limits)).toBeNull();
    expect(checkDiscount({ type: "FIXED", value: 1000 }, [5000], limits)).toBeNull();
  });
  it("rejects above-limit, invalid and non-positive final prices", () => {
    expect(checkDiscount({ type: "PERCENT", value: 3001 }, [5000], limits)).toBe("ABOVE_LIMIT");
    expect(checkDiscount({ type: "FIXED", value: 10_001 }, [50_000], limits)).toBe("ABOVE_LIMIT");
    expect(checkDiscount({ type: "FIXED", value: 0 }, [5000], limits)).toBe("INVALID_VALUE");
    expect(checkDiscount({ type: "PERCENT", value: 9_500 }, [5000], { maxPercent: 90, maxFixedCents: 1 })).toBe("INVALID_VALUE");
    expect(checkDiscount({ type: "FIXED", value: 5000 }, [5000, 9000], limits)).toBe("FINAL_PRICE_NOT_POSITIVE");
    expect(checkDiscount({ type: "FIXED", value: 6000 }, [9000, 5500], limits)).toBe("FINAL_PRICE_NOT_POSITIVE");
  });
});
