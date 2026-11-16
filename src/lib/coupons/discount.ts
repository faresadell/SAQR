/** Pure coupon maths (no database). All amounts are whole piasters (cents); nothing here rounds up in the customer's disfavour. */
export type CouponKind = "PERCENT" | "FIXED";

export const MAX_PERCENT = 30; // same ceiling the business set for offers
export const MAX_FIXED_CENTS = 10_000; // 100 EGP, same ceiling as offers

export interface CouponRule {
  kind: CouponKind;
  value: number; // percent (1..MAX_PERCENT) or piasters (100..MAX_FIXED_CENTS)
  merchantId: string | null; // null = platform coupon, valid on every shop
}

export function validateCouponValue(kind: CouponKind, value: unknown): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  return kind === "PERCENT" ? value >= 1 && value <= MAX_PERCENT : value >= 100 && value <= MAX_FIXED_CENTS;
}

/**
 * How much comes off each shop's product subtotal. A shop coupon only touches its own shop. A platform fixed amount is shared
 * across all shops in proportion to their subtotals (never more than a shop's subtotal, never more than the coupon's value).
 */
export function couponDiscounts(rule: CouponRule, subtotals: readonly { merchantId: string; subtotalCents: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const eligible = subtotals.filter((s) => (rule.merchantId === null || s.merchantId === rule.merchantId) && s.subtotalCents > 0);
  if (eligible.length === 0) return out;
  if (rule.kind === "PERCENT") {
    for (const s of eligible) out.set(s.merchantId, Math.floor((s.subtotalCents * rule.value) / 100));
    return out;
  }
  const total = eligible.reduce((n, s) => n + s.subtotalCents, 0);
  const budget = Math.min(rule.value, total);
  let given = 0;
  for (const s of eligible) {
    const part = Math.floor((budget * s.subtotalCents) / total);
    out.set(s.merchantId, part);
    given += part;
  }
  // The few piasters lost to rounding go to the first shops that can still take them.
  let left = budget - given;
  for (const s of eligible) {
    if (left <= 0) break;
    const room = s.subtotalCents - (out.get(s.merchantId) ?? 0);
    const extra = Math.min(room, left);
    out.set(s.merchantId, (out.get(s.merchantId) ?? 0) + extra);
    left -= extra;
  }
  return out;
}

export const normalizeCode = (raw: unknown): string => (typeof raw === "string" ? raw.trim().toUpperCase() : "");
export const CODE_PATTERN = /^[A-Z0-9]{4,20}$/;
