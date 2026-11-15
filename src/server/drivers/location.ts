import "server-only";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import type { Tx } from "@/server/orders/lifecycle";

/** A position older than this is not shown to the customer (the driver's phone went to sleep or lost signal). */
export const LOCATION_FRESH_MINUTES = 10;
const ACTIVE = ["DRIVER_ASSIGNED", "PICKED_UP"] as const;

export type ShareResult = { ok: true } | { ok: false; error: "INVALID_REQUEST" | "NO_ACTIVE_DELIVERY" | "RATE_LIMITED" };

async function myDriver(actor: Actor) {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  const driver = await db.driver.findUnique({ where: { userId: actor.id } });
  if (!driver || !driver.isActive) throw new AuthorizationError();
  return driver;
}

/** The driver shares their position. Only while they hold an undelivered order, and only the last position is kept. */
export async function shareLocation(actor: Actor, lat: number, lng: number, accuracyM?: number): Promise<ShareResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, error: "INVALID_REQUEST" };
  const driver = await myDriver(actor);
  const active = await db.order.count({ where: { deliveryStatus: { in: [...ACTIVE] }, delivery: { driverId: driver.id } } });
  if (active === 0) return { ok: false, error: "NO_ACTIVE_DELIVERY" };
  if (!(await consumeRateLimit(`driver-location:${driver.id}`, 12, 60))) return { ok: false, error: "RATE_LIMITED" };
  const accuracy = accuracyM !== undefined && Number.isFinite(accuracyM) ? Math.min(Math.max(Math.round(accuracyM), 0), 100_000) : null;
  await db.driverLocation.upsert({ where: { driverId: driver.id }, create: { driverId: driver.id, lat, lng, accuracyM: accuracy }, update: { lat, lng, accuracyM: accuracy } });
  return { ok: true };
}

/** The driver stops sharing: the stored position is deleted. */
export async function stopSharing(actor: Actor): Promise<void> {
  const driver = await myDriver(actor);
  await db.driverLocation.deleteMany({ where: { driverId: driver.id } });
}

/** Called when a delivery ends: nothing left to deliver means no position is kept. */
export async function clearLocationIfIdle(tx: Tx, driverId: string): Promise<void> {
  const left = await tx.order.count({ where: { deliveryStatus: { in: [...ACTIVE] }, delivery: { driverId } } });
  if (left === 0) await tx.driverLocation.deleteMany({ where: { driverId } });
}

export interface DriverPosition {
  lat: number;
  lng: number;
  updatedAt: Date;
}

/** What the customer may see: only their own order, only while it is out for delivery, only a fresh position. */
export async function getDriverPositionForCustomer(actor: Actor, orderId: string): Promise<DriverPosition | null> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { customerId: true, deliveryStatus: true, delivery: { select: { driver: { select: { location: true } } } } } });
  if (!order || actor.role !== "CUSTOMER" || order.customerId !== actor.id) throw new NotFoundError();
  const loc = order.delivery?.driver?.location;
  if (order.deliveryStatus !== "PICKED_UP" || !loc) return null;
  if (Date.now() - loc.updatedAt.getTime() > LOCATION_FRESH_MINUTES * 60_000) return null;
  return { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt };
}
