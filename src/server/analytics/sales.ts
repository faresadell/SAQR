import "server-only";
import { db } from "@/lib/db";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { getShopRating } from "@/server/reviews/service";

/** Real numbers from the orders table only. Days are Cairo days. Orders are placed in the window by their creation time. */
export const ANALYTICS_DAYS = 30;
const DAY_MS = 86_400_000;

export interface DayPoint { day: string; orders: number; revenueCents: number }
export interface TopProduct { name: string; units: number; revenueCents: number }
export interface SalesAnalytics {
  days: number;
  orders: number;
  delivered: number;
  cancelled: number; // cancelled or rejected
  open: number;
  /** Products paid for (after coupons) on delivered orders. */
  revenueCents: number;
  averageOrderCents: number | null;
  daily: DayPoint[];
  topProducts: TopProduct[];
  customers: number; // distinct customers with a delivered order in the window
  returningCustomers: number; // of those, customers with 2+ delivered orders (all time) in this scope
  couponOrders: number;
  couponDiscountCents: number;
}

const cairoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function salesAnalytics(merchantId: string | null, now = new Date()): Promise<SalesAnalytics> {
  const since = new Date(now.getTime() - ANALYTICS_DAYS * DAY_MS);
  const scope = merchantId ? { merchantId } : {};
  const orders = await db.order.findMany({
    where: { ...scope, createdAt: { gte: since } },
    select: { id: true, customerId: true, orderStatus: true, subtotalCents: true, discountCents: true, createdAt: true },
  });
  const delivered = orders.filter((o) => o.orderStatus === "DELIVERED");
  const net = (o: { subtotalCents: number; discountCents: number }) => o.subtotalCents - o.discountCents;
  const revenue = delivered.reduce((n, o) => n + net(o), 0);

  const byDay = new Map<string, DayPoint>();
  for (let i = ANALYTICS_DAYS - 1; i >= 0; i--) {
    const day = cairoDay(new Date(now.getTime() - i * DAY_MS));
    byDay.set(day, { day, orders: 0, revenueCents: 0 });
  }
  for (const o of orders) {
    if (o.orderStatus === "CANCELLED" || o.orderStatus === "REJECTED") continue;
    const p = byDay.get(cairoDay(o.createdAt));
    if (!p) continue;
    p.orders += 1;
    if (o.orderStatus === "DELIVERED") p.revenueCents += net(o);
  }

  const deliveredIds = delivered.map((o) => o.id);
  const items = deliveredIds.length ? await db.orderItem.groupBy({ by: ["nameSnapshot"], where: { orderId: { in: deliveredIds } }, _sum: { quantity: true, lineTotalCents: true } }) : [];
  const topProducts = items
    .map((i) => ({ name: i.nameSnapshot, units: i._sum.quantity ?? 0, revenueCents: i._sum.lineTotalCents ?? 0 }))
    .sort((a, b) => b.units - a.units || b.revenueCents - a.revenueCents)
    .slice(0, 5);

  const customerIds = [...new Set(delivered.map((o) => o.customerId))];
  const repeat = customerIds.length
    ? await db.order.groupBy({ by: ["customerId"], where: { ...scope, orderStatus: "DELIVERED", customerId: { in: customerIds } }, _count: { _all: true }, having: { customerId: { _count: { gte: 2 } } } })
    : [];

  const coupon = await db.order.aggregate({ where: { ...scope, createdAt: { gte: since }, couponCode: { not: null }, orderStatus: { notIn: ["CANCELLED", "REJECTED"] } }, _count: { _all: true }, _sum: { discountCents: true } });

  return {
    days: ANALYTICS_DAYS,
    orders: orders.length,
    delivered: delivered.length,
    cancelled: orders.filter((o) => o.orderStatus === "CANCELLED" || o.orderStatus === "REJECTED").length,
    open: orders.filter((o) => !["DELIVERED", "CANCELLED", "REJECTED"].includes(o.orderStatus)).length,
    revenueCents: revenue,
    averageOrderCents: delivered.length ? Math.round(revenue / delivered.length) : null,
    daily: [...byDay.values()],
    topProducts,
    customers: customerIds.length,
    returningCustomers: repeat.length,
    couponOrders: coupon._count._all,
    couponDiscountCents: coupon._sum.discountCents ?? 0,
  };
}

export async function merchantAnalytics(actor: Actor): Promise<{ sales: SalesAnalytics; rating: { average: number | null; count: number } }> {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
  if (!shop) throw new NotFoundError();
  const [sales, rating] = await Promise.all([salesAnalytics(shop.id), getShopRating(shop.id)]);
  return { sales, rating };
}

/** Platform-wide version for admins who may view orders. */
export async function platformAnalytics(actor: Actor): Promise<SalesAnalytics> {
  if (!hasPermission(actor, "orders.view")) throw new AuthorizationError();
  return salesAnalytics(null);
}
