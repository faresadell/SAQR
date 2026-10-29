import "server-only";
import type { OtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { generateOtp, hashOtp, otpMatches } from "@/lib/auth/otp";
import { getOtpSender } from "./otp-sender";

export type OtpRequestResult = { ok: true } | { ok: false; reason: "RATE_LIMITED" | "SEND_FAILED" };

/**
 * Issue a one-time code. Callers must show the same neutral message whether or not a code was sent,
 * so the response never reveals whether a phone number has an account.
 */
export async function requestOtp(phone: string, purpose: OtpPurpose, ip: string): Promise<OtpRequestResult> {
  const [ttl, cooldown, perPhone, perIp] = await Promise.all([
    getSetting("auth.otp.ttl_seconds"),
    getSetting("auth.otp.resend_cooldown_seconds"),
    getSetting("auth.otp.max_per_phone_per_hour"),
    getSetting("auth.otp.max_per_ip_per_hour"),
  ]);

  const latest = await db.otpCode.findFirst({ where: { phone, purpose }, orderBy: { createdAt: "desc" } });
  if (latest && Date.now() - latest.createdAt.getTime() < cooldown * 1000) return { ok: true };

  if (!(await consumeRateLimit(`otp:phone:${phone}`, perPhone, 3600))) return { ok: false, reason: "RATE_LIMITED" };
  if (ip !== "unknown" && !(await consumeRateLimit(`otp:ip:${ip}`, perIp, 3600))) {
    return { ok: false, reason: "RATE_LIMITED" };
  }

  const code = generateOtp();
  const record = await db.$transaction(async (tx) => {
    // Only the newest code is valid.
    await tx.otpCode.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    return tx.otpCode.create({
      data: {
        phone,
        purpose,
        codeHash: hashOtp(getEnv().SESSION_SECRET, phone, purpose, code),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
  });

  try {
    await getOtpSender().send(phone, code, purpose);
  } catch {
    await db.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, reason: "SEND_FAILED" };
  }
  return { ok: true };
}

/** Check a code. Each guess is counted atomically before comparing, so parallel guesses cannot beat the limit. */
export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const maxAttempts = await getSetting("auth.otp.max_attempts");

  const record = await db.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return false;

  const counted = await db.otpCode.updateMany({
    where: { id: record.id, consumedAt: null, attempts: { lt: maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return false;

  if (!otpMatches(record.codeHash, hashOtp(getEnv().SESSION_SECRET, phone, purpose, code))) return false;

  // Single use: only one concurrent request can consume the code.
  const consumed = await db.otpCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return consumed.count === 1;
}
