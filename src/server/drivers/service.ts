import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export type DriverError = "INVALID_REQUEST" | "PHONE_IN_USE" | "SHOP_NOT_APPROVED" | "WEAK_PASSWORD";
export type DriverResult<T> = ({ ok: true } & T) | { ok: false; error: DriverError };

/** A shop may create accounts for its own drivers. Independent drivers sign up themselves and take orders from the open board. */
async function ownShop(actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id } });
  if (!shop) throw new NotFoundError();
  return shop;
}

export interface CreateDriverInput {
  name: string;
  phone: string;
  /** Temporary password the shop gives the driver. The shop vouches for the driver, so the account is active at once (there is no SMS code). */
  password: string;
}

export async function createDriver(actor: Actor, input: CreateDriverInput): Promise<DriverResult<{ driverId: string }>> {
  const shop = await ownShop(actor);
  if (shop.status !== "APPROVED") return { ok: false, error: "SHOP_NOT_APPROVED" };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = typeof input.phone === "string" ? normalizeEgyptPhone(input.phone) : null;
  if (name.length < 2 || name.length > 80 || !phone) return { ok: false, error: "INVALID_REQUEST" };
  if (typeof input.password !== "string" || checkPasswordStrength(input.password, phone)) return { ok: false, error: "WEAK_PASSWORD" };
  const passwordHash = await hashPassword(input.password);
  try {
    const driverId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { phone, name, passwordHash, role: "DRIVER", status: "ACTIVE" } });
      await tx.starAccount.create({ data: { userId: user.id } });
      const driver = await tx.driver.create({ data: { userId: user.id, merchantId: shop.id } });
      await writeAudit({ actorId: actor.id, action: "DRIVER_CREATED", entityType: "Driver", entityId: driver.id, after: { merchantId: shop.id } }, tx);
      return driver.id;
    });
    return { ok: true, driverId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "PHONE_IN_USE" };
    throw error;
  }
}

export async function listMyDrivers(actor: Actor) {
  const shop = await ownShop(actor);
  const rows = await db.driver.findMany({ where: { merchantId: shop.id }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, phone: true, status: true } } } });
  return rows.map((d) => ({ id: d.id, name: d.user.name, phone: d.user.phone, accountStatus: d.user.status, isActive: d.isActive, createdAt: d.createdAt }));
}

/** Pause or resume one of the shop's drivers. A paused driver cannot be given orders or act on deliveries. */
export async function setDriverActive(actor: Actor, driverId: string, isActive: boolean): Promise<void> {
  const shop = await ownShop(actor);
  await db.$transaction(async (tx) => {
    const driver = await tx.driver.findUnique({ where: { id: driverId } });
    if (!driver || driver.merchantId !== shop.id) throw new NotFoundError();
    if (driver.isActive === isActive) return;
    await tx.driver.update({ where: { id: driverId }, data: { isActive } });
    await writeAudit({ actorId: actor.id, action: "DRIVER_ACTIVE_CHANGED", entityType: "Driver", entityId: driverId, before: { isActive: driver.isActive }, after: { isActive } }, tx);
  });
}
