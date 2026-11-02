// Commission settlement math. Integer piasters only. Pure (no database) so it is unit-tested.
import { addMoney, applyBasisPoints, assertPiasters } from "../money";

export interface SettledOrder {
  /** The product value the rate was applied to when the order was created (order.commissionBaseCents). */
  commissionBaseCents: number;
  /** The rate copied into the order at creation (order.commissionBp). Rate changes never reach old orders. */
  commissionBp: number;
  /** What the customer paid for the suborder (order.totalCents). */
  totalCents: number;
  /** Sum of COMPLETED refunds on the suborder. */
  refundedCents: number;
}

/**
 * Commission on what the merchant KEPT. Fully refunded -> 0. Partly refunded -> the refund reduces the base
 * (assumption: the data has no product/delivery split yet, so a refund is treated as product value, capped at the base).
 * Cancelled / rejected orders never get here: only delivered suborders are settled.
 */
export function retainedBase(o: SettledOrder): number {
  assertPiasters(o.commissionBaseCents);
  assertPiasters(o.refundedCents);
  if (o.refundedCents >= o.totalCents) return 0;
  return Math.max(0, o.commissionBaseCents - Math.min(o.refundedCents, o.commissionBaseCents));
}

export function retainedCommission(o: SettledOrder): number {
  return applyBasisPoints(retainedBase(o), o.commissionBp);
}

export interface SettlementLineDraft {
  orderId: string;
  kind: "ORDER" | "ADJUSTMENT";
  baseCents: number;
  commissionBp: number;
  commissionCents: number; // negative for ADJUSTMENT
}

export interface SettlementTotals {
  orderCount: number;
  baseCents: number;
  commissionCents: number;
  adjustmentCents: number;
  netDueCents: number;
}

export function totalsOf(lines: readonly SettlementLineDraft[]): SettlementTotals {
  const orders = lines.filter((l) => l.kind === "ORDER");
  const adjustments = lines.filter((l) => l.kind === "ADJUSTMENT");
  const commissionCents = addMoney(0, ...orders.map((l) => l.commissionCents));
  const adjustmentCents = addMoney(0, ...adjustments.map((l) => l.commissionCents));
  if (adjustmentCents > 0) throw new RangeError("Adjustments can only reduce the commission");
  return {
    orderCount: orders.length,
    baseCents: addMoney(0, ...orders.map((l) => l.baseCents)),
    commissionCents,
    adjustmentCents,
    netDueCents: addMoney(commissionCents, adjustmentCents),
  };
}

/** A later refund lowers what was already charged: the difference (<= 0) becomes an ADJUSTMENT line in a later statement. */
export function adjustmentFor(chargedCommissionCents: number, order: SettledOrder): number {
  const now = retainedCommission(order);
  return now < chargedCommissionCents ? now - chargedCommissionCents : 0;
}

export const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
