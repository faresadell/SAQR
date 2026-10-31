import "server-only";
import type { EmailCodePurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings";
import { EMAIL_CODE_MINUTES } from "@/lib/email/resend";
import { generateOtp, hashOtp, otpMatches } from "@/lib/auth/otp";
import { getEmailSender } from "./email-sender";

export type IssueResult = { ok: true } | { ok: false; reason: "RATE_LIMITED" | "SEND_FAILED" };

const binding = (userId: string, email: string) => `email:${userId}:${email}`;

/** Issue a 6-digit code to an address. Within the resend cooldown nothing new is sent (and the answer is still ok). */
export async function issueEmailCode(userId: string, email: string, purpose: EmailCodePurpose, ip: string): Promise<IssueResult> {
  const [cooldown, perUser, perIp] = await Promise.all([
    getSetting("auth.otp.resend_cooldown_seconds"),
    getSetting("auth.otp.max_per_phone_per_hour"),
    getSetting("auth.otp.max_per_ip_per_hour"),
  ]);
  const latest = await db.emailCode.findFirst({ where: { userId, purpose }, orderBy: { createdAt: "desc" } });
  if (latest && Date.now() - latest.createdAt.getTime() < cooldown * 1000) return { ok: true };
  if (!(await consumeRateLimit(`email:user:${userId}`, perUser, 3600))) return { ok: false, reason: "RATE_LIMITED" };
  if (ip !== "unknown" && !(await consumeRateLimit(`email:ip:${ip}`, perIp, 3600))) return { ok: false, reason: "RATE_LIMITED" };

  const code = generateOtp();
  const record = await db.$transaction(async (tx) => {
    await tx.emailCode.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: new Date() } }); // only the newest code works
    return tx.emailCode.create({
      data: { userId, email, purpose, codeHash: hashOtp(getEnv().SESSION_SECRET, binding(userId, email), purpose, code), expiresAt: new Date(Date.now() + EMAIL_CODE_MINUTES * 60_000) },
    });
  });
  try {
    await getEmailSender().send(email, purpose, code);
  } catch {
    await db.emailCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, reason: "SEND_FAILED" };
  }
  return { ok: true };
}

/** Each guess is counted atomically before comparing; a correct code is consumed exactly once. Returns the address it was sent to. */
export async function consumeEmailCode(userId: string, purpose: EmailCodePurpose, code: string, expectedEmail?: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const maxAttempts = await getSetting("auth.otp.max_attempts");
  const record = await db.emailCode.findFirst({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() }, ...(expectedEmail ? { email: expectedEmail } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  const counted = await db.emailCode.updateMany({ where: { id: record.id, consumedAt: null, attempts: { lt: maxAttempts } }, data: { attempts: { increment: 1 } } });
  if (counted.count !== 1) return null;
  if (!otpMatches(record.codeHash, hashOtp(getEnv().SESSION_SECRET, binding(userId, record.email), purpose, code))) return null;
  const consumed = await db.emailCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return consumed.count === 1 ? record.email : null;
}
