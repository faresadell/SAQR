import { retainedBase } from "../settlements/calc";

// Monthly contest ranking. Pure: the database layer only gathers the rows.
//   1. more qualifying completed orders
//   2. higher qualifying sales value (product value after discounts and refunds)
//   3. reached that result earlier (delivery time of the order that completed their count)
// userId is only a last deterministic tie-breaker so the same data always gives the same ranking.

export interface ContestOrderRow {
  orderId: string;
  customerId: string;
  merchantId: string;
  merchantOwnerId: string;
  /** Product value after discounts (what the commission was computed on). */
  commissionBaseCents: number;
  commissionBp: number;
  totalCents: number;
  /** Sum of COMPLETED refunds. */
  refundedCents: number;
  deliveredAt: Date;
}

export interface ContestRules {
  /** Orders whose product value is below this do not count (0 = no minimum). */
  minSubtotalCents: number;
  /** At most this many orders per customer per shop count (0 = no cap). Stops farming one friendly shop. */
  maxOrdersPerShop: number;
}

export interface Standing {
  rank: number;
  userId: string;
  qualifyingOrders: number;
  qualifyingSalesCents: number;
  reachedAt: Date;
}

export function whyNotQualifying(row: ContestOrderRow, rules: ContestRules): string | null {
  if (row.customerId === row.merchantOwnerId) return "SELF_ORDER"; // ordering from your own shop
  if (row.refundedCents >= row.totalCents) return "FULLY_REFUNDED";
  if (row.commissionBaseCents < rules.minSubtotalCents) return "BELOW_MINIMUM";
  return null;
}

export function rankStandings(rows: readonly ContestOrderRow[], rules: ContestRules, excludedUserIds: ReadonlySet<string> = new Set()): Standing[] {
  const seen = new Set<string>();
  const perCustomerShop = new Map<string, number>();
  const byUser = new Map<string, { count: number; sales: number; reachedAt: Date }>();
  // Oldest first, so caps keep the earliest orders and "reachedAt" is the delivery of the last counted order.
  const ordered = [...rows].sort((a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime() || (a.orderId < b.orderId ? -1 : 1));
  for (const row of ordered) {
    if (seen.has(row.orderId)) continue; // one order is never counted twice
    seen.add(row.orderId);
    if (excludedUserIds.has(row.customerId) || whyNotQualifying(row, rules) !== null) continue;
    if (rules.maxOrdersPerShop > 0) {
      const key = `${row.customerId}|${row.merchantId}`;
      const used = perCustomerShop.get(key) ?? 0;
      if (used >= rules.maxOrdersPerShop) continue;
      perCustomerShop.set(key, used + 1);
    }
    const entry = byUser.get(row.customerId) ?? { count: 0, sales: 0, reachedAt: row.deliveredAt };
    entry.count += 1;
    entry.sales += retainedBase({ commissionBaseCents: row.commissionBaseCents, commissionBp: row.commissionBp, totalCents: row.totalCents, refundedCents: row.refundedCents });
    entry.reachedAt = row.deliveredAt;
    byUser.set(row.customerId, entry);
  }
  return [...byUser.entries()]
    .map(([userId, e]) => ({ userId, qualifyingOrders: e.count, qualifyingSalesCents: e.sales, reachedAt: e.reachedAt }))
    .sort((a, b) => b.qualifyingOrders - a.qualifyingOrders || b.qualifyingSalesCents - a.qualifyingSalesCents || a.reachedAt.getTime() - b.reachedAt.getTime() || (a.userId < b.userId ? -1 : 1))
    .map((s, i) => ({ rank: i + 1, ...s }));
}
