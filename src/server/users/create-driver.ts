import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/email";
import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { AuthorizationError } from "@/server/errors";
import { cleanDisplayName } from "@/server/auth/change-name";
import { isVehicleType, type VehicleType } from "@/lib/vehicle";
import type { SessionUser } from "@/server/auth/session";

export type CreateDriverResult =
  | { ok: true; userId: string }
  | { ok: false; error: "INVALID_NAME" | "INVALID_VEHICLE" | "INVALID_PHONE" | "INVALID_EMAIL" | "WEAK_PASSWORD" | "PHONE_TAKEN" | "EMAIL_TAKEN" };

/**
 * An administrator opens a driver's account: it is active at once (the administrator vouches for the person), and the driver signs in
 * with the email and the temporary password they were given. Drivers cannot register themselves.
 */
export async function createDriverByAdmin(
  actor: SessionUser,
  input: { name: string; phone: string; email: string; password: string; vehicleType: string },
  ip: string,
): Promise<CreateDriverResult> {
  if (!hasPermission(actor.user, "users.manage")) throw new AuthorizationError();
  const name = cleanDisplayName(input.name);
  if (!name) return { ok: false, error: "INVALID_NAME" };
  if (!isVehicleType(input.vehicleType)) return { ok: false, error: "INVALID_VEHICLE" };
  const vehicleType: VehicleType = input.vehicleType;
  const phone = normalizeEgyptPhone(input.phone);
  if (!phone) return { ok: false, error: "INVALID_PHONE" };
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "INVALID_EMAIL" };
  if (checkPasswordStrength(input.password, phone)) return { ok: false, error: "WEAK_PASSWORD" };

  const [byPhone, byEmail] = await Promise.all([db.user.findUnique({ where: { phone }, select: { id: true } }), db.user.findUnique({ where: { email }, select: { id: true } })]);
  if (byPhone) return { ok: false, error: "PHONE_TAKEN" };
  if (byEmail) return { ok: false, error: "EMAIL_TAKEN" };

  const passwordHash = await hashPassword(input.password);
  try {
    const userId = await db.$transaction(async (tx) => {
      const now = new Date();
      const user = await tx.user.create({ data: { phone, email, name, passwordHash, role: "DRIVER", status: "ACTIVE", emailVerifiedAt: now, mustChangePassword: true } });
      await tx.driver.create({ data: { userId: user.id, merchantId: null, vehicleType } });
      await tx.starAccount.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
      await writeAudit({ actorId: actor.user.id, action: "DRIVER_CREATED_BY_ADMIN", entityType: "User", entityId: user.id, after: { role: "DRIVER", vehicleType }, ip }, tx);
      return user.id;
    });
    return { ok: true, userId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "PHONE_TAKEN" };
    throw error;
  }
}
