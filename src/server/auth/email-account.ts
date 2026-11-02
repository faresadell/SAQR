import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { normalizeEmail } from "@/lib/auth/email";
import { checkPasswordStrength, hashPassword, type PasswordProblem } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/permissions";
import { consumeEmailCode, issueEmailCode } from "./email-codes";

export type StartEmailResult = { ok: true } | { ok: false; error: "INVALID_REQUEST" | "RATE_LIMITED" | "SEND_FAILED" | "ALREADY_VERIFIED" };
export type ConfirmEmailResult = { ok: true; email: string } | { ok: false; error: "INVALID_CODE" | "EMAIL_TAKEN" | "RATE_LIMITED" | "INVALID_REQUEST" };

/**
 * Signed-in user asks to attach an address. The answer is the same whether the address belongs to someone else or not
 * (nothing is sent in that case), so this cannot be used to discover registered addresses.
 */
export async function startEmailVerification(actor: Actor, rawEmail: string, ip: string): Promise<StartEmailResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "INVALID_REQUEST" };
  const me = await db.user.findUnique({ where: { id: actor.id }, select: { email: true, emailVerifiedAt: true } });
  if (!me) return { ok: false, error: "INVALID_REQUEST" };
  if (me.email === email && me.emailVerifiedAt) return { ok: false, error: "ALREADY_VERIFIED" };
  const owner = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (owner && owner.id !== actor.id) return { ok: true };
  const sent = await issueEmailCode(actor.id, email, "VERIFY_EMAIL", ip);
  return sent.ok ? { ok: true } : { ok: false, error: sent.reason };
}

export async function confirmEmailVerification(actor: Actor, code: string, ip: string): Promise<ConfirmEmailResult> {
  const perUser = await getSetting("auth.login.max_per_phone_per_10min");
  if (!(await consumeRateLimit(`email:confirm:${actor.id}`, perUser, 600))) return { ok: false, error: "RATE_LIMITED" };
  const email = await consumeEmailCode(actor.id, "VERIFY_EMAIL", code);
  if (!email) return { ok: false, error: "INVALID_CODE" };
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { email, emailVerifiedAt: new Date() } });
      await writeAudit({ actorId: actor.id, action: "EMAIL_VERIFIED", entityType: "User", entityId: actor.id, ip }, tx);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "EMAIL_TAKEN" };
    throw error;
  }
  return { ok: true, email };
}

export type EmailResetRequestResult = { ok: true } | { ok: false; error: "INVALID_REQUEST" | "RATE_LIMITED" };
export type EmailResetConfirmResult = { ok: true } | { ok: false; error: "INVALID_CODE" | "RATE_LIMITED" | "INVALID_REQUEST" | "WEAK_PASSWORD"; problem?: PasswordProblem };

/** Neutral answer for unknown, unverified or administrator addresses (admins are recovered with their backup codes). */
export async function requestPasswordResetByEmail(rawEmail: string, ip: string): Promise<EmailResetRequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "INVALID_REQUEST" };
  const user = await db.user.findUnique({ where: { email } });
  const eligible = !!user && user.status === "ACTIVE" && !!user.emailVerifiedAt && user.role !== "ADMIN";
  if (!eligible) {
    const perIp = await getSetting("auth.otp.max_per_ip_per_hour");
    if (ip !== "unknown" && !(await consumeRateLimit(`email:ip:${ip}`, perIp, 3600))) return { ok: false, error: "RATE_LIMITED" };
    return { ok: true };
  }
  const sent = await issueEmailCode(user.id, email, "PASSWORD_RESET", ip);
  if (!sent.ok && sent.reason === "RATE_LIMITED") return { ok: false, error: "RATE_LIMITED" };
  return { ok: true };
}

export async function confirmPasswordResetByEmail(rawEmail: string, code: string, newPassword: string, ip: string): Promise<EmailResetConfirmResult> {
  const email = normalizeEmail(rawEmail);
  if (!email || typeof newPassword !== "string" || typeof code !== "string") return { ok: false, error: "INVALID_REQUEST" };
  const perEmail = await getSetting("auth.login.max_per_phone_per_10min");
  if (!(await consumeRateLimit(`reset:email:${email}`, perEmail, 600))) return { ok: false, error: "RATE_LIMITED" };
  const user = await db.user.findUnique({ where: { email } });
  const problem = checkPasswordStrength(newPassword, user?.phone);
  if (problem) return { ok: false, error: "WEAK_PASSWORD", problem };
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt || user.role === "ADMIN") return { ok: false, error: "INVALID_CODE" };
  if (!(await consumeEmailCode(user.id, "PASSWORD_RESET", code, email))) return { ok: false, error: "INVALID_CODE" };
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await writeAudit({ actorId: user.id, action: "PASSWORD_RESET", entityType: "User", entityId: user.id, after: { via: "email" }, ip }, tx);
  });
  return { ok: true };
}
