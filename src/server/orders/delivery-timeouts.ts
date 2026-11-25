import "server-only";
import { clearLocationIfIdle } from "@/server/drivers/location";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { DRIVER_RESPONSE_MINUTES, FEE_APPROVAL_MINUTES } from "@/lib/delivery-timing";
import { notifyInTx } from "@/server/notifications/service";
import { flushNotificationEmails, runSoon } from "@/server/notifications/email";
import { openTrip, setDeliveryStatus } from "@/server/orders/delivery";
import { announceBoardOrders } from "@/server/orders/driver-board";

const MIN = 60_000;

/**
 * Orders must never sit still: a driver who was given an order (by the shop or from the board) has DRIVER_RESPONSE_MINUTES to name the
 * delivery price, and the customer has FEE_APPROVAL_MINUTES to answer it. When the time runs out the whole unpicked trip goes back to
 * the open board and everyone involved is told. Idempotent (rechecked inside the transaction), safe to run as often as you like.
 */
export async function sweepDeliveryTimeouts(now = new Date()): Promise<{ released: number }> {
  const driverCutoff = new Date(now.getTime() - DRIVER_RESPONSE_MINUTES * MIN);
  const feeCutoff = new Date(now.getTime() - FEE_APPROVAL_MINUTES * MIN);
  const candidates = await db.deliveryRecord.findMany({
    where: {
      driverId: { not: null },
      order: { deliveryStatus: "DRIVER_ASSIGNED" },
      OR: [{ feeStatus: "NONE", assignedAt: { lt: driverCutoff } }, { feeStatus: "PROPOSED", feeProposedAt: { lt: feeCutoff } }],
    },
    select: { orderId: true, driverId: true, feeStatus: true },
    take: 100,
  });
  const done = new Set<string>();
  let released = 0;
  for (const c of candidates) {
    if (done.has(c.orderId) || !c.driverId) continue;
    const driverId = c.driverId;
    const reason = c.feeStatus === "PROPOSED" ? "FEE" : "DRIVER";
    released += await db.$transaction(async (tx) => {
      const trip = (await openTrip(tx, driverId, c.orderId)).filter((r) => r.feeStatus === c.feeStatus);
      if (!trip.some((r) => r.orderId === c.orderId)) return 0; // already handled by someone else
      const driver = await tx.driver.findUniqueOrThrow({ where: { id: driverId }, include: { user: { select: { name: true } } } });
      for (const r of trip) {
        done.add(r.orderId);
        await setDeliveryStatus(tx, r.order, "AWAITING_DRIVER", driver.userId, reason === "FEE" ? "customer did not answer the price in time" : "driver did not name a price in time");
        await tx.deliveryRecord.update({ where: { id: r.id }, data: { driverId: null, assignedAt: null, feeStatus: "NONE", feeExpectedCents: r.order.deliveryFeeCents, feeProposedAt: null } });
        const stamp = now.getTime();
        const why = reason === "FEE" ? "لم يرد العميل على سعر التوصيل في الوقت المحدد" : `لم يحدد السائق سعر التوصيل خلال ${DRIVER_RESPONSE_MINUTES} دقائق`;
        await notifyInTx(
          tx,
          { userId: r.order.merchant.ownerId, type: "DELIVERY_FAILED", title: "الطلب رجع لقائمة السائقين", body: `${why}، فرجع الطلب رقم ${r.order.number} لقائمة السائقين. تقدر تبعته لسائق تاني.`, data: { orderId: r.orderId }, dedupeKey: `delivery-timeout-shop:${r.orderId}:${stamp}` },
          { userId: driver.userId, type: "DELIVERY_FAILED", title: "سحبنا الطلب منك", body: `${why}، فرجع الطلب رقم ${r.order.number} للقائمة.`, data: { orderId: r.orderId }, dedupeKey: `delivery-timeout-driver:${r.orderId}:${stamp}` },
          ...(reason === "FEE" ? [{ userId: r.order.customerId, type: "DELIVERY_FEE_REFUSED", title: "انتهى وقت الرد على سعر التوصيل", body: `لم يصلنا ردك على سعر توصيل الطلب رقم ${r.order.number}، فرجع الطلب للسائقين ليقبله سائق آخر.`, data: { orderId: r.orderId }, dedupeKey: `delivery-timeout-customer:${r.orderId}:${stamp}` }] : []),
        );
        await writeAudit({ actorId: null, action: "DELIVERY_TIMED_OUT", entityType: "Order", entityId: r.orderId, after: { reason, driverId } }, tx);
      }
      await clearLocationIfIdle(tx, driverId);
      return trip.length;
    });
  }
  return { released };
}

let lastSweep = 0;
/** Cheap opportunistic run (at most once a minute per server instance) from pages people open anyway, in addition to the scheduled job. */
export function sweepSoon(): void {
  const now = Date.now();
  if (now - lastSweep < MIN) return;
  lastSweep = now;
  runSoon(async () => {
    await sweepDeliveryTimeouts();
    await announceBoardOrders();
    await flushNotificationEmails();
  });
}
