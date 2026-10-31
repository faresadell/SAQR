import "server-only";
import { db } from "@/lib/db";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { cairoMonthBounds, cairoMonthKey } from "@/lib/stars/rules";
import { MONTH_KEY_PATTERN, retainedBase, retainedCommission } from "@/lib/settlements/calc";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export type ReportError = "INVALID_REQUEST";
export interface SalesReport {
  monthKey: string;
  deliveredOrders: number;
  /** Product value only (delivery fees are not shop revenue and never part of the commission base). */
  productSalesCents: number;
  refundedCents: number;
  /** Commission on what the shop kept, at each order's stored rate. */
  commissionCents: number;
  /** Product sales kept after refunds minus that commission. */
  netAfterCommissionCents: number;
  cancelledOrders: number;
}

function bounds(monthKey: string): { start: Date; end: Date } | null {
  if (!MONTH_KEY_PATTERN.test(monthKey)) return null;
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const b = cairoMonthBounds(new Date(Date.UTC(y, m - 1, 15, 12)));
  return cairoMonthKey(b.start) === monthKey ? b : null;
}

async function build(monthKey: string, merchantId: string | null): Promise<SalesReport | null> {
  const b = bounds(monthKey);
  if (!b) return null;
  const delivered = merchantId
    ? await db.$queryRaw<{ orderId: string }[]>`SELECT DISTINCT o."id" AS "orderId" FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId" WHERE e."field" = 'orderStatus' AND e."toValue" = 'DELIVERED' AND e."createdAt" >= ${b.start} AND e."createdAt" < ${b.end} AND o."merchantId" = ${merchantId}`
    : await db.$queryRaw<{ orderId: string }[]>`SELECT DISTINCT o."id" AS "orderId" FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId" WHERE e."field" = 'orderStatus' AND e."toValue" = 'DELIVERED' AND e."createdAt" >= ${b.start} AND e."createdAt" < ${b.end}`;
  const ids = delivered.map((d) => d.orderId);
  const orders = ids.length ? await db.order.findMany({ where: { id: { in: ids } }, select: { id: true, subtotalCents: true, totalCents: true, commissionBaseCents: true, commissionBp: true } }) : [];
  const refunds = ids.length ? await db.refund.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, status: "COMPLETED" }, _sum: { amountCents: true } }) : [];
  const refunded = new Map(refunds.map((r) => [r.orderId, r._sum.amountCents ?? 0]));
  let sales = 0;
  let refundedTotal = 0;
  let commission = 0;
  let kept = 0;
  for (const o of orders) {
    const refundedCents = refunded.get(o.id) ?? 0;
    const settled = { commissionBaseCents: o.commissionBaseCents, commissionBp: o.commissionBp, totalCents: o.totalCents, refundedCents };
    sales += o.subtotalCents;
    refundedTotal += Math.min(refundedCents, o.totalCents);
    commission += retainedCommission(settled);
    kept += retainedBase(settled);
  }
  const cancelledRows = merchantId
    ? await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT o."id") AS n FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId" WHERE e."field" = 'orderStatus' AND e."toValue" IN ('CANCELLED','REJECTED') AND e."createdAt" >= ${b.start} AND e."createdAt" < ${b.end} AND o."merchantId" = ${merchantId}`
    : await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT o."id") AS n FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId" WHERE e."field" = 'orderStatus' AND e."toValue" IN ('CANCELLED','REJECTED') AND e."createdAt" >= ${b.start} AND e."createdAt" < ${b.end}`;
  return { monthKey, deliveredOrders: orders.length, productSalesCents: sales, refundedCents: refundedTotal, commissionCents: commission, netAfterCommissionCents: kept - commission, cancelledOrders: Number(cancelledRows[0]?.n ?? 0) };
}

/** The shop's own monthly numbers (Cairo month). Never another shop's. */
export async function merchantSalesReport(actor: Actor, monthKey: string): Promise<SalesReport | null> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop) throw new NotFoundError();
  return build(monthKey, shop.id);
}

/** Platform-wide numbers for the same month. Needs orders.view. */
export async function platformSalesReport(actor: Actor, monthKey: string): Promise<SalesReport | null> {
  if (!hasPermission(actor, "orders.view")) throw new AuthorizationError();
  return build(monthKey, null);
}
