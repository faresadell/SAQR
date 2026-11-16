import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/server/errors";
import { cairoDay, fillDays, windowStart, WINDOW_DAYS, type DayPoint } from "./queries";

export interface DriverAnalytics {
  days: number;
  deliveries: number;
  /** Delivery fees agreed for these deliveries (the customer pays them in cash to the driver). */
  feesCents: number;
  collectedCents: number;
  /** Average minutes from pick-up to delivery; null when no delivery has both times. */
  averageMinutes: number | null;
  daily: DayPoint[];
}

/** The driver's own last-30-days numbers. A user with no driver profile simply has nothing. */
export async function driverAnalytics(actor: Actor, now = new Date()): Promise<DriverAnalytics> {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  const driver = await db.driver.findUnique({ where: { userId: actor.id }, select: { id: true } });
  const rows = driver
    ? await db.deliveryRecord.findMany({
        where: { driverId: driver.id, deliveredAt: { gte: windowStart(now) }, feeStatus: "APPROVED" },
        select: { feeExpectedCents: true, collectionStatus: true, pickedUpAt: true, deliveredAt: true },
      })
    : [];
  const perDay = new Map<string, DayPoint>();
  let fees = 0;
  let collected = 0;
  const minutes: number[] = [];
  for (const r of rows) {
    fees += r.feeExpectedCents;
    if (r.collectionStatus === "COLLECTED") collected += r.feeExpectedCents;
    if (r.pickedUpAt && r.deliveredAt) minutes.push((r.deliveredAt.getTime() - r.pickedUpAt.getTime()) / 60_000);
    const day = cairoDay(r.deliveredAt ?? now);
    const cur = perDay.get(day) ?? { day, count: 0, cents: 0 };
    perDay.set(day, { day, count: cur.count + 1, cents: cur.cents + r.feeExpectedCents });
  }
  return {
    days: WINDOW_DAYS,
    deliveries: rows.length,
    feesCents: fees,
    collectedCents: collected,
    averageMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
    daily: fillDays([...perDay.values()], now),
  };
}
