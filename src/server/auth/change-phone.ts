import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { verifyPassword } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/permissions";

export type ChangePhoneResult =
  | { ok: true; phone: string }
  | { ok: false; error: "INVALID_PHONE" | "WRONG_PASSWORD" | "SAME_PHONE" | "PHONE_TAKEN" | "RATE_LIMITED" };

/**
 * A signed-in user replaces the contact phone. The current password is required, every attempt counts against a
 * per-user limit (so a stolen session cannot guess it), and the new number is stored as UNVERIFIED (no SMS exists).
 */
export async function changePhone(actor: Actor, rawPhone: string, password: string, ip: string): Promise<ChangePhoneResult> {
  const perUser = await getSetting("auth.login.max_per_phone_per_10min");
  if (!(await consumeRateLimit(`phone:change:${actor.id}`, perUser, 600))) return { ok: false, error: "RATE_LIMITED" };
  const phone = normalizeEgyptPhone(rawPhone);
  if (!phone) return { ok: false, error: "INVALID_PHONE" };
  const me = await db.user.findUnique({ where: { id: actor.id }, select: { phone: true, passwordHash: true } });
  if (!me) return { ok: false, error: "WRONG_PASSWORD" };
  if (!(await verifyPassword(password, me.passwordHash))) return { ok: false, error: "WRONG_PASSWORD" };
  if (me.phone === phone) return { ok: false, error: "SAME_PHONE" };
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { phone, phoneVerifiedAt: null } });
      await writeAudit({ actorId: actor.id, action: "PHONE_CHANGED", entityType: "User", entityId: actor.id, before: { phone: me.phone }, after: { phone }, ip }, tx);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "PHONE_TAKEN" };
    throw error;
  }
  return { ok: true, phone };
}
