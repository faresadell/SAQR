import "server-only";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { decryptSecret, parseEncryptionKey } from "@/lib/auth/secret-box";
import { verifyTotp } from "@/lib/auth/totp";
import { consumeEmailCode, issueEmailCode } from "./email-codes";
import { redeemRecoveryCode } from "./admin-recovery";

export const CONSENT_VERSION = "2026-10-v1";

// ───────────── Registration ─────────────

export interface RegisterInput {
  name: string;
  phone: string; // already normalized to E.164 (a contact/login number; it is NOT verified by a code)
  email: string; // already normalized; the activation code is sent here
  password: string;
  role: "CUSTOMER" | "MERCHANT" | "DRIVER";
}

export type RegisterResult = { ok: true } | { ok: false; error: "RATE_LIMITED" | "SEND_FAILED" };

/**
 * The result is identical whether the phone/email is new, pending or already registered, so this endpoint
 * cannot be used to discover which numbers or addresses have accounts. A code is only sent for a new account or a
 * still-pending one with the same phone; an account is activated only by the code sent to its email.
 */
export async function registerAccount(input: RegisterInput, ip: string): Promise<RegisterResult> {
  const perHour = await getSetting("auth.register.max_per_ip_per_hour");
  if (ip !== "unknown" && !(await consumeRateLimit(`register:ip:${ip}`, perHour, 3600))) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  // Hash first so response time is the same for every branch.
  const passwordHash = await hashPassword(input.password);
  const [byPhone, byEmail] = await Promise.all([db.user.findUnique({ where: { phone: input.phone } }), db.user.findUnique({ where: { email: input.email } })]);
  let targetId: string | null = null;

  if (!byPhone && !byEmail) {
    try {
      const created = await db.user.create({
        data: { phone: input.phone, email: input.email, name: input.name, passwordHash, role: input.role, status: "PENDING", consentVersion: CONSENT_VERSION, consentAcceptedAt: new Date() },
      });
      targetId = created.id;
    } catch (error) {
      // A parallel request created the same phone/email first: treat as already existing.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  } else if (byPhone && (!byEmail || byEmail.id === byPhone.id) && byPhone.status === "PENDING" && !byPhone.emailVerifiedAt && (await isSelfRegisteredPending(byPhone))) {
    // Safe: whoever completes the email code is the owner of that address, and the account is still unused.
    await db.user.update({
      where: { id: byPhone.id },
      data: { email: input.email, name: input.name, passwordHash, role: input.role, consentVersion: CONSENT_VERSION, consentAcceptedAt: new Date() },
    });
    targetId = byPhone.id;
  }

  if (targetId) {
    const sent = await issueEmailCode(targetId, input.email, "VERIFY_EMAIL", ip);
    if (!sent.ok) return { ok: false, error: sent.reason };
  }
  return { ok: true };
}

/** A pending account that a shop created for its driver is not something a stranger may take over. */
async function isSelfRegisteredPending(user: { id: string; role: Role }): Promise<boolean> {
  if (user.role !== "CUSTOMER" && user.role !== "MERCHANT" && user.role !== "DRIVER") return false;
  if (user.role !== "DRIVER") return true;
  const driver = await db.driver.findUnique({ where: { userId: user.id }, select: { merchantId: true } });
  return !driver?.merchantId;
}

// ───────────── Activation by email code ─────────────

export type VerifyResult =
  | { ok: true; user: { id: string; role: Role } }
  | { ok: false; error: "INVALID_CODE" | "RATE_LIMITED" | "SUSPENDED" };

/** `phone` identifies the pending account (kept in a short-lived cookie); the code must be the one sent to its email. */
export async function completeEmailActivation(phone: string, code: string, ip: string): Promise<VerifyResult> {
  const perPhone = await getSetting("auth.login.max_per_phone_per_10min");
  if (!(await consumeRateLimit(`verify:phone:${phone}`, perPhone, 600))) return { ok: false, error: "RATE_LIMITED" };

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || !user.email) return { ok: false, error: "INVALID_CODE" };
  if (user.status === "SUSPENDED") return { ok: false, error: "SUSPENDED" };
  if (!(await consumeEmailCode(user.id, "VERIFY_EMAIL", code, user.email))) return { ok: false, error: "INVALID_CODE" };

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { status: "ACTIVE", emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
    if (user.role === "CUSTOMER" || user.role === "MERCHANT" || user.role === "DRIVER") {
      await tx.starAccount.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
    }
    await writeAudit({ actorId: user.id, action: "EMAIL_VERIFIED", entityType: "User", entityId: user.id, after: { activated: true }, ip }, tx);
  });
  return { ok: true, user: { id: user.id, role: user.role } };
}

/** Sends a fresh activation code to a PENDING account's email. Neutral: nothing is revealed about the phone. */
export async function resendActivationCode(phone: string, ip: string): Promise<{ ok: true } | { ok: false; error: "RATE_LIMITED" }> {
  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.status !== "PENDING" || !user.email) return { ok: true };
  const sent = await issueEmailCode(user.id, user.email, "VERIFY_EMAIL", ip);
  return !sent.ok && sent.reason === "RATE_LIMITED" ? { ok: false, error: "RATE_LIMITED" } : { ok: true };
}

// ───────────── Login ─────────────

export interface LoginInput {
  phone: string; // normalized
  password: string;
  totp?: string;
  /** Administrators who lost their authenticator may present ONE backup code instead of the authenticator code. */
  recoveryCode?: string;
}

export type LoginResult =
  | { ok: true; user: { id: string; role: Role } }
  | { ok: false; error: "INVALID" | "RATE_LIMITED" | "SUSPENDED" | "NEEDS_VERIFICATION" };

async function registerFailedLogin(userId: string, ip: string): Promise<void> {
  const [maxFailures, lockMinutes] = await Promise.all([getSetting("auth.login.max_failures"), getSetting("auth.login.lock_minutes")]);
  const updated = await db.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (updated.failedLoginCount >= maxFailures) {
    await db.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + lockMinutes * 60_000) },
    });
    await writeAudit({ actorId: userId, action: "ACCOUNT_LOCKED", entityType: "User", entityId: userId, ip });
  }
}

/** Every failure returns the same INVALID error and costs the same time, so accounts cannot be enumerated. */
export async function authenticate(input: LoginInput, ip: string): Promise<LoginResult> {
  const [perIp, perPhone] = await Promise.all([
    getSetting("auth.login.max_per_ip_per_10min"),
    getSetting("auth.login.max_per_phone_per_10min"),
  ]);
  if (ip !== "unknown" && !(await consumeRateLimit(`login:ip:${ip}`, perIp, 600))) return { ok: false, error: "RATE_LIMITED" };
  if (!(await consumeRateLimit(`login:phone:${input.phone}`, perPhone, 600))) return { ok: false, error: "RATE_LIMITED" };

  const user = await db.user.findUnique({ where: { phone: input.phone } });
  const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : (await burnPasswordCheck(input.password), false);

  if (user?.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: "INVALID" };
  if (!user || !passwordOk) {
    if (user) await registerFailedLogin(user.id, ip);
    return { ok: false, error: "INVALID" };
  }

  if (user.status === "SUSPENDED") return { ok: false, error: "SUSPENDED" };
  if (user.status === "PENDING") {
    if (user.email) await issueEmailCode(user.id, user.email, "VERIFY_EMAIL", ip);
    return { ok: false, error: "NEEDS_VERIFICATION" };
  }

  // Administrators must also present a valid authenticator code (replay-protected).
  if (user.role === "ADMIN") {
    if (!user.totpSecretEnc) return { ok: false, error: "INVALID" };
    if (!input.totp && input.recoveryCode) {
      if (!(await redeemRecoveryCode(user.id, input.recoveryCode, ip))) {
        await registerFailedLogin(user.id, ip);
        return { ok: false, error: "INVALID" };
      }
    } else {
      if (!input.totp) return { ok: false, error: "INVALID" };
      let secret: Buffer;
      try {
        secret = decryptSecret(parseEncryptionKey(getEnv().DATA_ENCRYPTION_KEY), user.totpSecretEnc);
      } catch {
        return { ok: false, error: "INVALID" };
      }
      const step = verifyTotp(secret, input.totp.trim(), Date.now(), user.lastTotpStep);
      if (step === null) {
        await registerFailedLogin(user.id, ip);
        return { ok: false, error: "INVALID" };
      }
      // Atomic: only one request can consume a given time step.
      const claimed = await db.user.updateMany({
        where: { id: user.id, OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }] },
        data: { lastTotpStep: step },
      });
      if (claimed.count !== 1) return { ok: false, error: "INVALID" };
    }
    await writeAudit({ actorId: user.id, action: "ADMIN_LOGIN", entityType: "User", entityId: user.id, ip });
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  return { ok: true, user: { id: user.id, role: user.role } };
}
