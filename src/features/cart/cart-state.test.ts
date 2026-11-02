import { describe, expect, it } from "vitest";
import { cartReducer, emptyCart, groupByMerchant, itemCount, MAX_LINE_QUANTITY, parseStoredCart, type CartLine } from "./cart-state";

const burger = { productId: "p1", merchantId: "m1", merchantName: "مطعم أ", name: "برجر", priceCents: 8500 };
const tea = { productId: "p2", merchantId: "m2", merchantName: "عطارة ب", name: "شاي", priceCents: 2500 };

describe("cartReducer", () => {
  it("adds items from several merchants into one cart", () => {
    let s = cartReducer(emptyCart, { type: "add", line: burger });
    s = cartReducer(s, { type: "add", line: tea, quantity: 2 });
    expect(s.lines).toHaveLength(2);
    expect(itemCount(s.lines)).toBe(3);
  });

  it("merges the same product and caps quantity", () => {
    let s = cartReducer(emptyCart, { type: "add", line: burger, quantity: MAX_LINE_QUANTITY });
    s = cartReducer(s, { type: "add", line: burger });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("removes a line when quantity drops to zero and never goes negative", () => {
    let s = cartReducer(emptyCart, { type: "add", line: burger });
    s = cartReducer(s, { type: "setQuantity", productId: "p1", quantity: 0 });
    expect(s.lines).toHaveLength(0);
    s = cartReducer(s, { type: "setQuantity", productId: "p1", quantity: -3 });
    expect(s.lines).toHaveLength(0);
  });

  it("removes one merchant without touching the others", () => {
    let s = cartReducer(emptyCart, { type: "add", line: burger });
    s = cartReducer(s, { type: "add", line: tea });
    s = cartReducer(s, { type: "removeMerchant", merchantId: "m1" });
    expect(s.lines.map((l) => l.productId)).toEqual(["p2"]);
  });
});

describe("groupByMerchant", () => {
  it("keeps one subtotal per merchant (never merged)", () => {
    const lines: CartLine[] = [
      { ...burger, quantity: 2 },
      { ...tea, quantity: 1 },
      { ...burger, productId: "p3", name: "بطاطس", priceCents: 3000, quantity: 1 },
    ];
    const groups = groupByMerchant(lines);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.subtotalCents).toBe(2 * 8500 + 3000);
    expect(groups[1]?.subtotalCents).toBe(2500);
  });
});

describe("parseStoredCart", () => {
  it("accepts a valid cart", () => {
    const raw = JSON.stringify({ lines: [{ ...burger, quantity: 2 }] });
    expect(parseStoredCart(raw).lines).toHaveLength(1);
  });

  it("falls back to an empty cart for corrupt or tampered data", () => {
    expect(parseStoredCart(null).lines).toEqual([]);
    expect(parseStoredCart("not json").lines).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ lines: [{ ...burger, quantity: -1 }] })).lines).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ lines: [{ ...burger, priceCents: 1.5, quantity: 1 }] })).lines).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ lines: [{ ...burger, quantity: 1 }, { ...burger, quantity: 1 }] })).lines).toEqual([]);
  });

  it("reprice updates only known products and keeps quantities", () => {
    const base = { lines: [{ productId: "a", merchantId: "m", merchantName: "M", name: "A", priceCents: 1000, quantity: 2 }, { productId: "b", merchantId: "m", merchantName: "M", name: "B", priceCents: 500, quantity: 1 }] };
    const next = cartReducer(base, { type: "reprice", prices: { a: 900 } });
    expect(next.lines.map((l) => [l.productId, l.priceCents, l.quantity])).toEqual([["a", 900, 2], ["b", 500, 1]]);
  });
});
