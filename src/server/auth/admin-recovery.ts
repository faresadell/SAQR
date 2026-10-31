import "server-only";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/permissions";
import { generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode, RECOVERY_CODE_COUNT } from "@/lib/auth/recovery-code";
import { AuthorizationError } from "@/server/errors";

export type GenerateRecoveryResult = { ok: true; codes: string[] } | { ok: false; error: "WRONG_PASSWORD" | "RATE_LIMITED" };

/**
 * An administrator creates a fresh set of backup codes (shown ONCE). Needs the current password again.
 * Older unused codes stop working at once. Codes only replace the authenticator code at login, never the password.
 */
export async function generateRecoveryCodes(actor: Actor, password: string, ip: string): Promise<GenerateRecoveryResult> {
  if (actor.role !== "ADMIN") throw new AuthorizationError();
  if (!(await consumeRateLimit(`recovery:gen:${actor.id}`, 5, 3600))) return { ok: false, error: "RATE_LIMITED" };
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!user || typeof password !== "string" || !(await verifyPassword(password, user.passwordHash))) return { ok: false, error: "WRONG_PASSWORD" };
  const secret = getEnv().SESSION_SECRET;
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await db.$transaction(async (tx) => {
    await tx.adminRecoveryCode.updateMany({ where: { userId: actor.id, usedAt: null }, data: { usedAt: new Date() } }); // replaced, not deleted
    await tx.adminRecoveryCode.createMany({ data: codes.map((c) => ({ userId: actor.id, codeHash: hashRecoveryCode(secret, actor.id, c) })) });
    await writeAudit({ actorId: actor.id, action: "ADMIN_RECOVERY_CODES_GENERATED", entityType: "User", entityId: actor.id, after: { count: RECOVERY_CODE_COUNT }, ip }, tx);
  });
  return { ok: true, codes };
}

export async function countUnusedRecoveryCodes(actor: Actor): Promise<number> {
  if (actor.role !== "ADMIN") throw new AuthorizationError();
  return db.adminRecoveryCode.count({ where: { userId: actor.id, usedAt: null } });
}

/** Consumes one code exactly once (atomic). Used by the login flow after the password was already verified. */
export async function useRecoveryCode(userId: string, rawCode: string, ip: string): Promise<boolean> {
  const code = normalizeRecoveryCode(rawCode);
  if (!code) return false;
  const claimed = await db.adminRecoveryCode.updateMany({
    where: { userId, usedAt: null, codeHash: hashRecoveryCode(getEnv().SESSION_SECRET, userId, code) },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return false;
  const remaining = await db.adminRecoveryCode.count({ where: { userId, usedAt: null } });
  await writeAudit({ actorId: userId, action: "ADMIN_RECOVERY_CODE_USED", entityType: "User", entityId: userId, after: { remaining }, ip });
  return true;
}
