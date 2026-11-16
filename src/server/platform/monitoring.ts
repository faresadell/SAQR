import "server-only";
import { db } from "@/lib/db";
import { cairoDay, fillDays, windowStart, WINDOW_DAYS, type DayPoint } from "@/lib/analytics/days";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/server/errors";
import { orderIdsWithEvent } from "@/server/analytics/queries";

/** How long an order may sit in a state before the admin is nudged. These are monitoring thresholds, not business rules. */
export const STALE_MINUTES = { AWAITING_MERCHANT_APPROVAL: 60, AWAITING_PAYMENT: 24 * 60, PAYMENT_CONFIRMATION: 12 * 60, NO_DRIVER: 30 } as const;

export interface Monitoring {
  days: number;
  deliveredOrders: number;
  salesCents: number;
  cancelledOrders: number;
  cancelRatePercent: number | null;
  /** Coupon discounts the platform carries (coupons created by an admin) on orders that were not cancelled. */
  platformCouponCents: number;
  newUsers: { customers: number; merchants: number; drivers: number };
  daily: DayPoint[];
  openByStatus: { status: string; count: number }[];
  attention: {
    merchantSlow: number;
    unpaid: number;
    paymentUnconfirmed: number;
    noDriver: number;
    complaintsOpen: number;
    refundsOpen: number;
    merchantsPending: number;
  };
}

const OPEN = ["AWAITING_PAYMENT", "AWAITING_MERCHANT_APPROVAL", "APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "CANCELLATION_REQUESTED"] as const;
const ago = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

/** Platform-wide health: last 30 days (Cairo days) plus what needs a human now. Needs orders.view. */
export async function platformMonitoring(actor: Actor, now = new Date()): Promise<Monitoring> {
  if (!hasPermission(actor, "orders.view")) throw new AuthorizationError();
  const since = windowStart(now);
  const [delivered, ended] = await Promise.all([orderIdsWithEvent(null, "DELIVERED", since), orderIdsWithEvent(null, "CANCELLED_OR_REJECTED", since)]);
  const ids = delivered.map((d) => d.orderId);
  const [orders, open, users, platformCoupon, merchantSlow, unpaid, paymentUnconfirmed, noDriver, complaintsOpen, refundsOpen, merchantsPending] = await Promise.all([
    ids.length ? db.order.findMany({ where: { id: { in: ids } }, select: { id: true, subtotalCents: true, discountCents: true } }) : [],
    db.order.groupBy({ by: ["orderStatus"], where: { orderStatus: { in: [...OPEN] } }, _count: { _all: true } }),
    db.user.groupBy({ by: ["role"], where: { createdAt: { gte: since }, role: { in: ["CUSTOMER", "MERCHANT", "DRIVER"] } }, _count: { _all: true } }),
    db.order.aggregate({ where: { couponFundedBy: "PLATFORM", orderStatus: { notIn: ["CANCELLED", "REJECTED"] } }, _sum: { discountCents: true } }),
    db.order.count({ where: { orderStatus: "AWAITING_MERCHANT_APPROVAL", updatedAt: { lt: ago(now, STALE_MINUTES.AWAITING_MERCHANT_APPROVAL) } } }),
    db.order.count({ where: { orderStatus: "AWAITING_PAYMENT", paymentStatus: "NOT_REQUIRED_YET", updatedAt: { lt: ago(now, STALE_MINUTES.AWAITING_PAYMENT) } } }),
    db.order.count({ where: { paymentStatus: { in: ["RECEIPT_SUBMITTED", "AWAITING_MERCHANT_CONFIRMATION"] }, orderStatus: { in: [...OPEN] }, updatedAt: { lt: ago(now, STALE_MINUTES.PAYMENT_CONFIRMATION) } } }),
    db.order.count({ where: { deliveryStatus: "AWAITING_DRIVER", orderStatus: { in: ["READY", "OUT_FOR_DELIVERY"] }, updatedAt: { lt: ago(now, STALE_MINUTES.NO_DRIVER) } } }),
    db.complaint.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.refund.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    db.merchant.count({ where: { status: "PENDING_REVIEW" } }),
  ]);
  const atById = new Map(delivered.map((d) => [d.orderId, d.at]));
  const perDay = new Map<string, DayPoint>();
  let sales = 0;
  for (const o of orders) {
    const net = o.subtotalCents - o.discountCents;
    sales += net;
    const day = cairoDay(atById.get(o.id) ?? now);
    const cur = perDay.get(day) ?? { day, count: 0, cents: 0 };
    perDay.set(day, { day, count: cur.count + 1, cents: cur.cents + net });
  }
  const roleCount = (r: string) => users.find((u) => u.role === r)?._count._all ?? 0;
  const total = orders.length + ended.length;
  return {
    days: WINDOW_DAYS,
    deliveredOrders: orders.length,
    salesCents: sales,
    cancelledOrders: ended.length,
    cancelRatePercent: total ? Math.round((ended.length / total) * 100) : null,
    platformCouponCents: platformCoupon._sum.discountCents ?? 0,
    newUsers: { customers: roleCount("CUSTOMER"), merchants: roleCount("MERCHANT"), drivers: roleCount("DRIVER") },
    daily: fillDays([...perDay.values()], now),
    openByStatus: OPEN.map((status) => ({ status, count: open.find((o) => o.orderStatus === status)?._count._all ?? 0 })).filter((o) => o.count > 0),
    attention: { merchantSlow, unpaid, paymentUnconfirmed, noDriver, complaintsOpen, refundsOpen, merchantsPending },
  };
}
