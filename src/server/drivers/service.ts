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

export function statusOf(isOnline: boolean, activeJobs: number): DriverStatus {
  if (!isOnline) return "OFFLINE";
  return activeJobs > 0 ? "ON_TRIP" : "AVAILABLE";
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
    if (driver.isOnline === isOnline) return;
    await tx.driver.update({ where: { id: driver.id }, data: { isOnline } });
    await writeAudit({ actorId: actor.id, action: "DRIVER_AVAILABILITY_CHANGED", entityType: "Driver", entityId: driver.id, before: { isOnline: driver.isOnline }, after: { isOnline } }, tx);
  });
}

export async function getMyAvailability(actor: Actor): Promise<{ status: DriverStatus; isOnline: boolean }> {
  if (actor.role !== "DRIVER") throw new AuthorizationError();
  const driver = await db.driver.findUnique({ where: { userId: actor.id } });
  if (!driver) return { status: "OFFLINE", isOnline: false };
  return { status: statusOf(driver.isOnline, await activeJobCount(db, driver.id)), isOnline: driver.isOnline };
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
    where: { isActive: true, isOnline: true, user: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, user: { select: { name: true } }, deliveries: { where: { order: { deliveryStatus: { in: [...BUSY_DELIVERY_STATUSES] } } }, select: { id: true } } },
  });
  return rows
    .map((d) => ({ id: d.id, name: d.user.name, status: statusOf(true, d.deliveries.length) }))
    .sort((a, b) => Number(a.status === "ON_TRIP") - Number(b.status === "ON_TRIP"));
}
