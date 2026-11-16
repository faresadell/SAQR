import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { getShopRating } from "@/server/reviews/service";
import { cairoDay, fillDays, windowStart, WINDOW_DAYS, type DayPoint } from "@/lib/analytics/days";
import { orderIdsWithEvent } from "./queries";

export interface MerchantAnalytics {
  days: number;
  deliveredOrders: number;
  /** Products the customers paid for (after offers and coupons). Delivery is cash to the driver and never counted. */
  salesCents: number;
  averageOrderCents: number | null;
  cancelledOrders: number;
  /** cancelled or rejected out of all orders that ended (delivered + cancelled/rejected); null when nothing ended. */
  cancelRatePercent: number | null;
  couponDiscountCents: number;
  topProducts: { name: string; quantity: number; cents: number }[];
  daily: DayPoint[];
  rating: { average: number | null; count: number };
}

/** The shop's own last-30-days numbers. Counted from real delivered orders only. */
export async function merchantAnalytics(actor: Actor, now = new Date()): Promise<MerchantAnalytics> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
  if (!shop) throw new NotFoundError();
  const since = windowStart(now);
  const [delivered, ended] = await Promise.all([orderIdsWithEvent(shop.id, "DELIVERED", since), orderIdsWithEvent(shop.id, "CANCELLED_OR_REJECTED", since)]);
  const ids = delivered.map((d) => d.orderId);
  const orders = ids.length ? await db.order.findMany({ where: { id: { in: ids } }, select: { id: true, subtotalCents: true, discountCents: true } }) : [];
  const items = ids.length ? await db.orderItem.groupBy({ by: ["nameSnapshot"], where: { orderId: { in: ids } }, _sum: { quantity: true, lineTotalCents: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }) : [];
  const atById = new Map(delivered.map((d) => [d.orderId, d.at]));
  const perDay = new Map<string, DayPoint>();
  let sales = 0;
  let coupon = 0;
  for (const o of orders) {
    const net = o.subtotalCents - o.discountCents;
    sales += net;
    coupon += o.discountCents;
    const day = cairoDay(atById.get(o.id) ?? now);
    const cur = perDay.get(day) ?? { day, count: 0, cents: 0 };
    perDay.set(day, { day, count: cur.count + 1, cents: cur.cents + net });
  }
  const total = orders.length + ended.length;
  return {
    days: WINDOW_DAYS,
    deliveredOrders: orders.length,
    salesCents: sales,
    averageOrderCents: orders.length ? Math.round(sales / orders.length) : null,
    cancelledOrders: ended.length,
    cancelRatePercent: total ? Math.round((ended.length / total) * 100) : null,
    couponDiscountCents: coupon,
    topProducts: items.map((i) => ({ name: i.nameSnapshot, quantity: i._sum.quantity ?? 0, cents: i._sum.lineTotalCents ?? 0 })),
    daily: fillDays([...perDay.values()], now),
    rating: await getShopRating(shop.id),
  };
}
