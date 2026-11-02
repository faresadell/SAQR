import { describe, expect, it } from "vitest";
import { rankStandings, whyNotQualifying, type ContestOrderRow } from "./ranking";

let n = 0;
function row(customerId: string, extra: Partial<ContestOrderRow> = {}): ContestOrderRow {
  n += 1;
  return { orderId: `o${n}`, customerId, merchantId: "m1", merchantOwnerId: "owner1", commissionBaseCents: 10_000, commissionBp: 800, totalCents: 12_000, refundedCents: 0, deliveredAt: new Date(2026, 9, 1, 10, n), ...extra };
}
const rules = { minSubtotalCents: 0, maxOrdersPerShop: 0 };

describe("contest ranking", () => {
  it("ranks by completed qualifying orders first", () => {
    const rows = [row("a"), row("a"), row("a"), row("b"), row("b"), row("c")];
    expect(rankStandings(rows, rules).map((s) => [s.userId, s.qualifyingOrders])).toEqual([["a", 3], ["b", 2], ["c", 1]]);
  });

  it("breaks ties by qualifying sales, then by who reached the result first", () => {
    const rows = [
      row("a", { commissionBaseCents: 5_000, deliveredAt: new Date(2026, 9, 2) }),
      row("b", { commissionBaseCents: 9_000, deliveredAt: new Date(2026, 9, 5) }),
      row("c", { commissionBaseCents: 9_000, deliveredAt: new Date(2026, 9, 3) }),
    ];
    expect(rankStandings(rows, rules).map((s) => s.userId)).toEqual(["c", "b", "a"]); // same sales b/c: c got there first
  });

  it("excludes cancelled-by-refund, self-orders, below-minimum orders and excluded people", () => {
    const rows = [
      row("a", { refundedCents: 12_000 }), // fully refunded
      row("a", { merchantOwnerId: "a" }), // own shop
      row("a", { commissionBaseCents: 500 }), // below minimum
      row("a"),
      row("x"),
      row("x"),
    ];
    const standings = rankStandings(rows, { minSubtotalCents: 1_000, maxOrdersPerShop: 0 }, new Set(["x"]));
    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({ userId: "a", qualifyingOrders: 1 });
    expect(whyNotQualifying(rows[0]!, rules)).toBe("FULLY_REFUNDED");
    expect(whyNotQualifying(rows[1]!, rules)).toBe("SELF_ORDER");
  });

  it("a partial refund still counts the order but lowers its sales value", () => {
    const [s] = rankStandings([row("a", { refundedCents: 4_000 })], rules);
    expect(s).toMatchObject({ qualifyingOrders: 1, qualifyingSalesCents: 6_000 });
  });

  it("counts an order id only once and applies the per-shop cap to the earliest orders", () => {
    const dup = row("a");
    const rows = [dup, { ...dup }, row("a"), row("a"), row("a", { merchantId: "m2" })];
    expect(rankStandings(rows, rules)[0]!.qualifyingOrders).toBe(4);
    expect(rankStandings(rows, { minSubtotalCents: 0, maxOrdersPerShop: 2 })[0]!.qualifyingOrders).toBe(3); // 2 at m1 + 1 at m2
  });

  it("is deterministic and empty for no data", () => {
    expect(rankStandings([], rules)).toEqual([]);
    const rows = [row("b", { deliveredAt: new Date(2026, 9, 1) }), row("a", { deliveredAt: new Date(2026, 9, 1) })];
    expect(rankStandings(rows, rules)).toEqual(rankStandings([...rows].reverse(), rules));
  });
});
