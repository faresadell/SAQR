import { describe, expect, it } from "vitest";
import { couponDiscounts, normalizeCode, validateCouponValue } from "./discount";

const subs = [{ merchantId: "a", subtotalCents: 10_000 }, { merchantId: "b", subtotalCents: 5_000 }];

describe("coupon maths", () => {
  it("percent applies per shop and rounds down", () => {
    expect([...couponDiscounts({ kind: "PERCENT", value: 10, merchantId: null }, subs)]).toEqual([["a", 1000], ["b", 500]]);
    expect(couponDiscounts({ kind: "PERCENT", value: 15, merchantId: null }, [{ merchantId: "a", subtotalCents: 999 }]).get("a")).toBe(149);
  });
  it("a shop coupon only touches its own shop", () => {
    expect([...couponDiscounts({ kind: "PERCENT", value: 20, merchantId: "b" }, subs)]).toEqual([["b", 1000]]);
    expect(couponDiscounts({ kind: "FIXED", value: 2000, merchantId: "zzz" }, subs).size).toBe(0);
  });
  it("a platform fixed amount is shared in proportion and adds up exactly", () => {
    const d = couponDiscounts({ kind: "FIXED", value: 1001, merchantId: null }, subs);
    expect([...d.values()].reduce((n, v) => n + v, 0)).toBe(1001);
    expect(d.get("a")! > d.get("b")!).toBe(true);
  });
  it("never discounts more than the subtotal or more than the coupon value", () => {
    expect(couponDiscounts({ kind: "FIXED", value: 10_000, merchantId: "b" }, subs).get("b")).toBe(5000);
    const d = couponDiscounts({ kind: "FIXED", value: 10_000, merchantId: null }, [{ merchantId: "a", subtotalCents: 300 }]);
    expect(d.get("a")).toBe(300);
  });
  it("validates values and normalises codes", () => {
    expect(validateCouponValue("PERCENT", 30)).toBe(true);
    expect(validateCouponValue("PERCENT", 31)).toBe(false);
    expect(validateCouponValue("FIXED", 99)).toBe(false);
    expect(validateCouponValue("FIXED", 10_000)).toBe(true);
    expect(validateCouponValue("FIXED", 10.5)).toBe(false);
    expect(normalizeCode("  save10 ")).toBe("SAVE10");
  });
});
