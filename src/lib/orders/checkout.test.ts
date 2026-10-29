import { describe, expect, it } from "vitest";
import { buildCheckoutQuote, type PricedProduct } from "./checkout";

const p = (id: string, merchantId: string, priceCents: number, extra: Partial<PricedProduct> = {}): PricedProduct => ({
  id, merchantId, nameAr: `منتج ${id}`, priceCents, isAvailable: true, isArchived: false, ...extra,
});
const products = new Map([p("a", "m1", 2500), p("b", "m1", 1000), p("c", "m2", 4000), p("x", "m2", 500, { isAvailable: false }), p("z", "m3", 500, { isArchived: true })].map((x) => [x.id, x]));
const fee = () => 1500;

describe("buildCheckoutQuote", () => {
  it("splits a multi-merchant cart into one suborder per merchant with exact totals", () => {
    const r = buildCheckoutQuote({ lines: [{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }, { productId: "c", quantity: 3 }], products, feeForMerchant: fee });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.suborders.length).toBe(2);
    expect(r.quote.suborders[0]?.merchantId).toBe("m1");
    expect(r.quote.suborders[0]?.subtotalCents).toBe(6000);
    expect(r.quote.suborders[0]?.totalCents).toBe(7500);
    expect(r.quote.suborders[1]?.subtotalCents).toBe(12000);
    expect(r.quote.subtotalCents).toBe(18000);
    expect(r.quote.deliveryFeeCents).toBe(3000);
    expect(r.quote.totalCents).toBe(21000);
  });

  it("merges repeated lines of one product", () => {
    const r = buildCheckoutQuote({ lines: [{ productId: "a", quantity: 1 }, { productId: "a", quantity: 2 }], products, feeForMerchant: fee });
    expect(r.ok && r.quote.suborders[0]?.items.length).toBe(1);
    expect(r.ok && r.quote.suborders[0]?.items[0]?.quantity).toBe(3);
  });

  it("refuses bad carts instead of repricing", () => {
    const run = (lines: Parameters<typeof buildCheckoutQuote>[0]["lines"]) => buildCheckoutQuote({ lines, products, feeForMerchant: fee });
    expect(run([])).toEqual({ ok: false, error: "EMPTY_CART" });
    expect(run([{ productId: "a", quantity: 0 }])).toEqual({ ok: false, error: "INVALID_QUANTITY", productId: "a" });
    expect(run([{ productId: "a", quantity: 1.5 }])).toEqual({ ok: false, error: "INVALID_QUANTITY", productId: "a" });
    expect(run([{ productId: "a", quantity: 100 }])).toEqual({ ok: false, error: "INVALID_QUANTITY", productId: "a" });
    expect(run([{ productId: "nope", quantity: 1 }])).toEqual({ ok: false, error: "PRODUCT_NOT_FOUND", productId: "nope" });
    expect(run([{ productId: "x", quantity: 1 }])).toEqual({ ok: false, error: "PRODUCT_UNAVAILABLE", productId: "x" });
    expect(run([{ productId: "z", quantity: 1 }])).toEqual({ ok: false, error: "PRODUCT_UNAVAILABLE", productId: "z" });
    expect(run([{ productId: "a", quantity: 1, expectedUnitPriceCents: 2400 }])).toEqual({ ok: false, error: "PRICE_CHANGED", productId: "a" });
  });

  it("rejects an invalid fee", () => {
    expect(buildCheckoutQuote({ lines: [{ productId: "a", quantity: 1 }], products, feeForMerchant: () => -1 })).toEqual({ ok: false, error: "INVALID_FEE" });
  });

  it("accepts a matching expected price", () => {
    const r = buildCheckoutQuote({ lines: [{ productId: "a", quantity: 1, expectedUnitPriceCents: 2500 }], products, feeForMerchant: fee });
    expect(r.ok).toBe(true);
  });
});
