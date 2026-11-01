// Cart -> checkout quote. Pure functions only (no database, no framework) so the money rules are easy to test.
// The server action that creates orders must load products INSIDE the order transaction, call buildCheckoutQuote with
// those fresh rows, and store exactly what the quote returns. Nothing priced by the browser is trusted.
import { addMoney, assertPiasters } from "../money";

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

export interface CartLineInput {
  productId: string;
  quantity: number;
  /** Price the customer saw (piasters, AFTER any running discount). If it differs from the current price the checkout is refused, never silently repriced. */
  expectedUnitPriceCents?: number;
}

export interface PricedProduct {
  id: string;
  merchantId: string;
  nameAr: string;
  priceCents: number;
  isAvailable: boolean;
  isArchived: boolean;
  /** Discount for ONE unit from a running offer, already validated server-side (0 / undefined = none). */
  unitDiscountCents?: number;
  offerId?: string | null;
}

export interface SuborderItemDraft {
  productId: string;
  nameSnapshot: string;
  /** Normal price of one unit. */
  unitPriceCents: number;
  /** Discount taken off one unit (0 = none) and the offer that gave it. */
  unitDiscountCents: number;
  offerId: string | null;
  quantity: number;
  /** unitDiscountCents x quantity. */
  discountCents: number;
  /** (unitPriceCents - unitDiscountCents) x quantity: what is charged; the commission base is the sum of these. */
  lineTotalCents: number;
}

export interface SuborderDraft {
  merchantId: string;
  items: SuborderItemDraft[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}

export interface CheckoutQuote {
  suborders: SuborderDraft[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}

export type CheckoutError =
  | "EMPTY_CART"
  | "TOO_MANY_LINES"
  | "INVALID_QUANTITY"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "INVALID_FEE";

export type CheckoutResult =
  | { ok: true; quote: CheckoutQuote }
  | { ok: false; error: CheckoutError; productId?: string };

export interface QuoteInput {
  lines: CartLineInput[];
  /** Current rows keyed by product id, read inside the same transaction that creates the orders. */
  products: ReadonlyMap<string, PricedProduct>;
  /** Delivery fee for one suborder of this merchant (zone fee, resolved on the server). One fee per suborder: see docs/PHASE4.md. */
  feeForMerchant: (merchantId: string) => number;
}

export function buildCheckoutQuote(input: QuoteInput): CheckoutResult {
  const { lines, products, feeForMerchant } = input;
  if (lines.length === 0) return { ok: false, error: "EMPTY_CART" };
  if (lines.length > MAX_CART_LINES) return { ok: false, error: "TOO_MANY_LINES" };

  // Merge repeated lines of the same product so one product is one order item.
  const merged = new Map<string, CartLineInput>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
      return { ok: false, error: "INVALID_QUANTITY", productId: line.productId };
    }
    const prev = merged.get(line.productId);
    if (!prev) {
      merged.set(line.productId, { ...line });
      continue;
    }
    if (prev.expectedUnitPriceCents !== line.expectedUnitPriceCents) {
      return { ok: false, error: "PRICE_CHANGED", productId: line.productId };
    }
    prev.quantity += line.quantity;
    if (prev.quantity > MAX_LINE_QUANTITY) return { ok: false, error: "INVALID_QUANTITY", productId: line.productId };
  }

  const byMerchant = new Map<string, SuborderItemDraft[]>();
  for (const line of merged.values()) {
    const product = products.get(line.productId);
    if (!product) return { ok: false, error: "PRODUCT_NOT_FOUND", productId: line.productId };
    if (product.isArchived || !product.isAvailable) return { ok: false, error: "PRODUCT_UNAVAILABLE", productId: line.productId };
    assertPiasters(product.priceCents, "price");
    const unitDiscount = product.unitDiscountCents ?? 0;
    if (!Number.isSafeInteger(unitDiscount) || unitDiscount < 0 || unitDiscount >= product.priceCents) return { ok: false, error: "PRICE_CHANGED", productId: line.productId }; // never free or negative
    const effectiveUnit = product.priceCents - unitDiscount;
    if (line.expectedUnitPriceCents !== undefined && line.expectedUnitPriceCents !== effectiveUnit) {
      return { ok: false, error: "PRICE_CHANGED", productId: line.productId };
    }
    const item: SuborderItemDraft = {
      productId: product.id,
      nameSnapshot: product.nameAr,
      unitPriceCents: product.priceCents,
      unitDiscountCents: unitDiscount,
      offerId: unitDiscount > 0 ? (product.offerId ?? null) : null,
      quantity: line.quantity,
      discountCents: assertPiasters(unitDiscount * line.quantity, "line discount"),
      lineTotalCents: assertPiasters(effectiveUnit * line.quantity, "line total"),
    };
    const list = byMerchant.get(product.merchantId) ?? [];
    list.push(item);
    byMerchant.set(product.merchantId, list);
  }

  const suborders: SuborderDraft[] = [];
  for (const [merchantId, items] of byMerchant) {
    const fee = feeForMerchant(merchantId);
    if (!Number.isSafeInteger(fee) || fee < 0) return { ok: false, error: "INVALID_FEE" };
    const subtotalCents = addMoney(...items.map((i) => i.lineTotalCents));
    suborders.push({ merchantId, items, subtotalCents, deliveryFeeCents: fee, totalCents: addMoney(subtotalCents, fee) });
  }
  // Stable order so the same cart always produces the same suborder sequence.
  suborders.sort((a, b) => (a.merchantId < b.merchantId ? -1 : 1));

  return {
    ok: true,
    quote: {
      suborders,
      subtotalCents: addMoney(...suborders.map((s) => s.subtotalCents)),
      deliveryFeeCents: addMoney(...suborders.map((s) => s.deliveryFeeCents)),
      totalCents: addMoney(...suborders.map((s) => s.totalCents)),
    },
  };
}
