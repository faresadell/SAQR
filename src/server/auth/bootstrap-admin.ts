import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/auth/email";
import { cleanDisplayName } from "@/server/auth/change-name";

export type BootstrapResult =
  | { ok: true }
  | { ok: false; error: "DISABLED" | "ALREADY_SETUP" | "RATE_LIMITED" | "WRONG_TOKEN" | "INVALID_PHONE" | "INVALID_EMAIL" | "INVALID_NAME" | "WEAK_PASSWORD" | "SHORT_PASSWORD" };

const ADVISORY_LOCK_KEY = 727_001;

/** The one-time page is available only while SETUP_TOKEN is set AND no administrator exists yet. */
export async function isSetupOpen(): Promise<boolean> {
  if (!getEnv().SETUP_TOKEN) return false;
  return (await db.user.count({ where: { role: "ADMIN" } })) === 0;
}

function sameToken(given: string, wanted: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(wanted);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Creates the FIRST administrator (a super admin who signs in with email and password). Needs the deployment's SETUP_TOKEN,
 * refuses once any administrator exists (serialized by a database lock, so two concurrent submissions create one),
 * and is rate-limited per address.
 */
export async function createFirstAdmin(input: { token: string; email: string; phone: string; name: string; password: string }, ip: string): Promise<BootstrapResult> {
  const env = getEnv();
  if (!env.SETUP_TOKEN) return { ok: false, error: "DISABLED" };
  if (!(await consumeRateLimit(`setup:ip:${ip}`, 10, 600))) return { ok: false, error: "RATE_LIMITED" };
  if (!sameToken(input.token, env.SETUP_TOKEN)) return { ok: false, error: "WRONG_TOKEN" };
  const phone = normalizeEgyptPhone(input.phone);
  if (!phone) return { ok: false, error: "INVALID_PHONE" };
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "INVALID_EMAIL" };
  const name = cleanDisplayName(input.name);
  if (!name) return { ok: false, error: "INVALID_NAME" };
  if (input.password.length < 12) return { ok: false, error: "SHORT_PASSWORD" };
  if (checkPasswordStrength(input.password, phone) !== null) return { ok: false, error: "WEAK_PASSWORD" };

  const passwordHash = await hashPassword(input.password);
  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;
    if ((await tx.user.count({ where: { role: "ADMIN" } })) > 0) return false;
    const admin = await tx.user.create({
      data: { phone, email, name, role: "ADMIN", status: "ACTIVE", isSuperAdmin: true, phoneVerifiedAt: new Date(), emailVerifiedAt: new Date(), passwordHash },
    });
    await writeAudit({ actorId: null, action: "ADMIN_CREATED", entityType: "User", entityId: admin.id, after: { phone, email, name, via: "setup-page" } }, tx);
    return true;
  });
  if (!created) return { ok: false, error: "ALREADY_SETUP" };
  return { ok: true };
}
