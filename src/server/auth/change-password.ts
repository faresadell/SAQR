import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { checkPasswordStrength, hashPassword, verifyPassword, type PasswordProblem } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/permissions";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "WRONG_PASSWORD" | "SAME_PASSWORD" | "RATE_LIMITED" | "WEAK"; problem?: PasswordProblem };

/**
 * A signed-in user sets a new password. The current one is required and every attempt counts against a per-user limit.
 * All OTHER sessions are ended, so a stolen session cannot outlive the change; the current one stays signed in.
 */
export async function changePassword(actor: Actor, currentSessionId: string, current: string, next: string, ip: string): Promise<ChangePasswordResult> {
  const limit = await getSetting("auth.login.max_per_phone_per_10min");
  if (!(await consumeRateLimit(`password:change:${actor.id}`, limit, 600))) return { ok: false, error: "RATE_LIMITED" };
  const me = await db.user.findUnique({ where: { id: actor.id }, select: { phone: true, passwordHash: true } });
  if (!me || !(await verifyPassword(current, me.passwordHash))) return { ok: false, error: "WRONG_PASSWORD" };
  if (current === next) return { ok: false, error: "SAME_PASSWORD" };
  const problem = checkPasswordStrength(next, me.phone);
  if (problem) return { ok: false, error: "WEAK", problem };
  const passwordHash = await hashPassword(next);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: actor.id, id: { not: currentSessionId } } });
    await writeAudit({ actorId: actor.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: actor.id, ip }, tx);
  });
  return { ok: true };
}
