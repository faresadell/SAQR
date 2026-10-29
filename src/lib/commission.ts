import { toLatinDigits } from "./auth/phone";
import { applyBasisPoints } from "./money";

/**
 * Platform commission, tied to the MERCHANT's membership tier (never a customer fee).
 * REGULAR = "Basic" (8% agreed), BUSINESS = "Premium" (5% agreed).
 * Calculation base: the eligible PRODUCT amount, excluding delivery fees. How discounts and
 * partial refunds change that base is an open decision, see docs/PHASE2.md.
 */
export type TierName = "REGULAR" | "BUSINESS";

export const TIER_LABELS_AR: Record<TierName, string> = {
  REGULAR: "عادية (Basic)",
  BUSINESS: "مميزة (Premium)",
};

export const COMMISSION_MAX_BASIS_POINTS = 5000; // 50%: guards against typing mistakes (also a DB CHECK)

/** The three numbers an order stores in its financial record when it is created. */
export interface CommissionSnapshot {
  commissionBp: number;
  commissionBaseCents: number;
  commissionCents: number;
}

export function computeCommission(baseCents: number, basisPoints: number): CommissionSnapshot {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > COMMISSION_MAX_BASIS_POINTS) {
    throw new RangeError("basisPoints out of range");
  }
  return { commissionBp: basisPoints, commissionBaseCents: baseCents, commissionCents: applyBasisPoints(baseCents, basisPoints) };
}

/** "8" -> 800, "7.5" -> 750, "7.25" -> 725. Accepts Arabic digits. Returns null when invalid or out of range. */
export function parsePercentToBasisPoints(input: string): number | null {
  const text = toLatinDigits(input).trim().replace(/[٫,]/g, ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return basisPoints <= COMMISSION_MAX_BASIS_POINTS ? basisPoints : null;
}

/** 800 -> "8", 750 -> "7.5", 725 -> "7.25". */
export function formatPercent(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
