import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import type { Tx } from "@/server/orders/lifecycle";

/** Drivers sign up by themselves and are independent. A driver says whether they are taking work; "on a trip" is derived. */
export type DriverStatus = "AVAILABLE" | "ON_TRIP" | "OFFLINE";

/** Delivery stages in which a driver is out on (or committed to) a job. */
export const BUSY_DELIVERY_STATUSES = ["DRIVER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] as const;

/** "Available" lapses when the driver has not used the app for this long (they may have forgotten to switch it off). */
export const AVAILABLE_TTL_HOURS = 3;
const TOUCH_EVERY_MS = 5 * 60_000;

export const freshSince = (now = new Date()): Date => new Date(now.getTime() - AVAILABLE_TTL_HOURS * 3_600_000);

/** Online means: switched on AND seen recently. A driver holding an order stays on a trip however long the app is idle. */
export function statusOf(driver: { isOnline: boolean; lastSeenAt: Date | null }, activeJobs: number, now = new Date()): DriverStatus {
  if (!driver.isOnline) return "OFFLINE";
  if (activeJobs > 0) return "ON_TRIP";
  return driver.lastSeenAt && driver.lastSeenAt >= freshSince(now) ? "AVAILABLE" : "OFFLINE";
}

/** Called whenever a driver uses the app: keeps an "available" driver available (at most one write per few minutes). A lapsed driver is not revived by this; they switch it on again. */
export async function touchDriver(userId: string): Promise<void> {
  await db.driver.updateMany({ where: { userId, isOnline: true, lastSeenAt: { gte: freshSince(), lt: new Date(Date.now() - TOUCH_EVERY_MS) } }, data: { lastSeenAt: new Date() } });
}

export async function activeJobCount(tx: Tx | typeof db, driverId: string): Promise<number> {
  return tx.deliveryRecord.count({ where: { driverId, order: { deliveryStatus: { in: [...BUSY_DELIVERY_STATUSES] } } } });
}

/** The signed-in driver turns availability on or off. A suspended driver cannot. */
export async function setMyAvailability(actor: Actor, isOnline: boolean): Promise<void> {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  await db.$transaction(async (tx) => {
    const driver = await tx.driver.upsert({ where: { userId: actor.id }, create: { userId: actor.id, merchantId: null }, update: {} });
    if (!driver.isActive) throw new AuthorizationError();
    if (driver.isOnline === isOnline && !isOnline) return;
    await tx.driver.update({ where: { id: driver.id }, data: { isOnline, ...(isOnline ? { lastSeenAt: new Date() } : {}) } });
    if (driver.isOnline === isOnline) return; // switching on again only refreshes "last seen"
    await writeAudit({ actorId: actor.id, action: "DRIVER_AVAILABILITY_CHANGED", entityType: "Driver", entityId: driver.id, before: { isOnline: driver.isOnline }, after: { isOnline } }, tx);
  });
}

export async function getMyAvailability(actor: Actor): Promise<{ status: DriverStatus; isOnline: boolean }> {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  const before = await db.driver.findUnique({ where: { userId: actor.id } });
  if (!before) return { status: "OFFLINE", isOnline: false };
  // Opening the app keeps an available driver available (a lapsed one must switch it on again).
  await touchDriver(actor.id);
  const driver = (await db.driver.findUnique({ where: { userId: actor.id } })) ?? before;
  const status = statusOf(driver, await activeJobCount(db, driver.id));
  return { status, isOnline: status !== "OFFLINE" };
}

/**
 * Drivers a shop can ask for a delivery: the ones who said they are taking work (available or on a trip), with their status.
 * Only name and status are shown; nothing else about the driver.
 */
export async function listDriversForShop(actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop) throw new NotFoundError();
  const rows = await db.driver.findMany({
    where: { isActive: true, isOnline: true, user: { status: "ACTIVE" }, OR: [{ lastSeenAt: { gte: freshSince() } }, { deliveries: { some: { order: { deliveryStatus: { in: [...BUSY_DELIVERY_STATUSES] } } } } }] },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, user: { select: { name: true } }, deliveries: { where: { order: { deliveryStatus: { in: [...BUSY_DELIVERY_STATUSES] } } }, select: { id: true } } },
  });
  return rows
    .map((d) => ({ id: d.id, name: d.user.name, status: statusOf({ isOnline: true, lastSeenAt: new Date() }, d.deliveries.length) }))
    .sort((a, b) => Number(a.status === "ON_TRIP") - Number(b.status === "ON_TRIP"));
}
