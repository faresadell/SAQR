import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { checkPasswordStrength, hashPassword, type PasswordProblem } from "@/lib/auth/password";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { requestOtp, verifyOtp } from "@/server/auth/otp-service";

export type ResetRequestResult = { ok: true } | { ok: false; error: "RATE_LIMITED" | "INVALID_REQUEST" };
export type ResetConfirmResult = { ok: true } | { ok: false; error: "INVALID_CODE" | "RATE_LIMITED" | "INVALID_REQUEST" | "WEAK_PASSWORD"; problem?: PasswordProblem };

/**
 * Step 1. ALWAYS answers the same way, so it never reveals whether a number has an account. A code is sent only to a verified
 * ACTIVE non-admin account (administrators need their authenticator and are recovered by the main administrator).
 */
export async function requestPasswordReset(rawPhone: string, ip: string): Promise<ResetRequestResult> {
  const phone = typeof rawPhone === "string" ? normalizeEgyptPhone(rawPhone) : null;
  if (!phone) return { ok: false, error: "INVALID_REQUEST" };
  const user = await db.user.findUnique({ where: { phone } });
  const eligible = !!user && user.status === "ACTIVE" && !!user.phoneVerifiedAt && user.role !== "ADMIN";
  if (!eligible) {
    // same work and same answer as the real path (the limiter still counts, so probing is throttled)
    const perIp = await getSetting("auth.otp.max_per_ip_per_hour");
    if (ip !== "unknown" && !(await consumeRateLimit(`otp:ip:${ip}`, perIp, 3600))) return { ok: false, error: "RATE_LIMITED" };
    return { ok: true };
  }
  const sent = await requestOtp(phone, "PASSWORD_RESET", ip);
  if (!sent.ok && sent.reason === "RATE_LIMITED") return { ok: false, error: "RATE_LIMITED" };
  return { ok: true };
}

/** Step 2. Code + new password. Success changes the password, unlocks the account and signs out every device. */
export async function confirmPasswordReset(rawPhone: string, code: string, newPassword: string, ip: string): Promise<ResetConfirmResult> {
  const phone = typeof rawPhone === "string" ? normalizeEgyptPhone(rawPhone) : null;
  if (!phone || typeof newPassword !== "string" || typeof code !== "string") return { ok: false, error: "INVALID_REQUEST" };
  const perPhone = await getSetting("auth.login.max_per_phone_per_10min");
  if (!(await consumeRateLimit(`reset:phone:${phone}`, perPhone, 600))) return { ok: false, error: "RATE_LIMITED" };
  const problem = checkPasswordStrength(newPassword, phone);
  if (problem) return { ok: false, error: "WEAK_PASSWORD", problem };
  if (!(await verifyOtp(phone, "PASSWORD_RESET", code))) return { ok: false, error: "INVALID_CODE" };
  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.status !== "ACTIVE" || user.role === "ADMIN") return { ok: false, error: "INVALID_CODE" };
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await writeAudit({ actorId: user.id, action: "PASSWORD_RESET", entityType: "User", entityId: user.id, ip }, tx);
  });
  return { ok: true };
}
