// Offer discount math. Integer piasters only; pure so it is unit-tested.
export type DiscountType = "PERCENT" | "FIXED";

export interface Discount {
  type: DiscountType;
  /** PERCENT: basis points (1500 = 15%). FIXED: piasters taken off EACH unit. */
  value: number;
}

/** Discount for ONE unit. Rounds down (the shop never gives more than the stated percentage). */
export function unitDiscountCents(discount: Discount, priceCents: number): number {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new RangeError("price must be a non-negative integer");
  return discount.type === "PERCENT" ? Math.floor((priceCents * discount.value) / 10_000) : discount.value;
}

/**
 * The discount that really applies at checkout, or 0 when it would make the final price zero or negative
 * (the product is then sold at its normal price, never free).
 */
export function appliedUnitDiscountCents(discount: Discount, priceCents: number): number {
  const d = unitDiscountCents(discount, priceCents);
  return d > 0 && priceCents - d > 0 ? d : 0;
}

export interface DiscountLimits {
  maxPercent: number; // whole percent
  maxFixedCents: number;
}

export type DiscountProblem = "INVALID_VALUE" | "ABOVE_LIMIT" | "FINAL_PRICE_NOT_POSITIVE";

/** Checks an offer's discount against the admin limits and every product's current price. */
export function checkDiscount(discount: Discount, productPricesCents: readonly number[], limits: DiscountLimits): DiscountProblem | null {
  if (!Number.isSafeInteger(discount.value) || discount.value < 1) return "INVALID_VALUE";
  if (discount.type === "PERCENT") {
    if (discount.value > 9_000) return "INVALID_VALUE"; // technical ceiling: never 100%
    if (discount.value > limits.maxPercent * 100) return "ABOVE_LIMIT";
  } else if (discount.value > limits.maxFixedCents) return "ABOVE_LIMIT";
  for (const price of productPricesCents) {
    if (price - unitDiscountCents(discount, price) <= 0) return "FINAL_PRICE_NOT_POSITIVE";
  }
  return null;
}
