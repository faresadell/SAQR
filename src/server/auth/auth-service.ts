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
import { requestOtp, verifyOtp } from "./otp-service";

export const CONSENT_VERSION = "2026-10-v1";

// ───────────── Registration ─────────────

export interface RegisterInput {
  name: string;
  phone: string; // already normalized to E.164
  password: string;
  role: "CUSTOMER" | "MERCHANT";
}

export type RegisterResult = { ok: true } | { ok: false; error: "RATE_LIMITED" | "SEND_FAILED" };

/**
 * The result is identical whether the phone is new, pending or already registered, so this endpoint
 * cannot be used to discover which numbers have accounts. A code is only sent for new/pending accounts.
 */
export async function registerAccount(input: RegisterInput, ip: string): Promise<RegisterResult> {
  const perHour = await getSetting("auth.register.max_per_ip_per_hour");
  if (ip !== "unknown" && !(await consumeRateLimit(`register:ip:${ip}`, perHour, 3600))) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  // Hash first so response time is the same for every branch.
  const passwordHash = await hashPassword(input.password);
  const existing = await db.user.findUnique({ where: { phone: input.phone } });
  let sendCode = false;

  if (!existing) {
    try {
      await db.user.create({
        data: {
          phone: input.phone,
          name: input.name,
          passwordHash,
          role: input.role,
          status: "PENDING",
          consentVersion: CONSENT_VERSION,
          consentAcceptedAt: new Date(),
        },
      });
      sendCode = true;
    } catch (error) {
      // A parallel request created the same phone first: treat as already existing.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  } else if (existing.status === "PENDING" && !existing.phoneVerifiedAt && (existing.role === "CUSTOMER" || existing.role === "MERCHANT")) {
    // Safe: whoever completes the SMS code is the real owner of the number.
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        passwordHash,
        role: input.role,
        consentVersion: CONSENT_VERSION,
        consentAcceptedAt: new Date(),
      },
    });
    sendCode = true;
  }

  if (sendCode) {
    const result = await requestOtp(input.phone, "SIGNUP", ip);
    if (!result.ok) return { ok: false, error: result.reason };
  }
  return { ok: true };
}

// ───────────── Phone verification ─────────────

export type VerifyResult =
  | { ok: true; user: { id: string; role: Role } }
  | { ok: false; error: "INVALID_CODE" | "RATE_LIMITED" | "SUSPENDED" };

export async function completePhoneVerification(phone: string, code: string, ip: string): Promise<VerifyResult> {
  const perPhone = await getSetting("auth.login.max_per_phone_per_10min");
  if (!(await consumeRateLimit(`verify:phone:${phone}`, perPhone, 600))) return { ok: false, error: "RATE_LIMITED" };

  if (!(await verifyOtp(phone, "SIGNUP", code))) return { ok: false, error: "INVALID_CODE" };

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) return { ok: false, error: "INVALID_CODE" };
  if (user.status === "SUSPENDED") return { ok: false, error: "SUSPENDED" };

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { status: "ACTIVE", phoneVerifiedAt: user.phoneVerifiedAt ?? new Date() } });
    if (user.role === "CUSTOMER" || user.role === "MERCHANT" || user.role === "DRIVER") {
      await tx.starAccount.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
    }
    await writeAudit({ actorId: user.id, action: "USER_PHONE_VERIFIED", entityType: "User", entityId: user.id, ip }, tx);
  });
  return { ok: true, user: { id: user.id, role: user.role } };
}

// ───────────── Login ─────────────

export interface LoginInput {
  phone: string; // normalized
  password: string;
  totp?: string;
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
    await requestOtp(user.phone, "SIGNUP", ip);
    return { ok: false, error: "NEEDS_VERIFICATION" };
  }

  // Administrators must also present a valid authenticator code (replay-protected).
  if (user.role === "ADMIN") {
    if (!user.totpSecretEnc || !input.totp) return { ok: false, error: "INVALID" };
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
    await writeAudit({ actorId: user.id, action: "ADMIN_LOGIN", entityType: "User", entityId: user.id, ip });
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  return { ok: true, user: { id: user.id, role: user.role } };
}
