import type { PrismaClient } from "@prisma/client";

/**
 * Housekeeping for tables that only ever grow: rate-limit hits, one-time codes and expired sessions.
 * It takes the client as an argument (no "server-only" import) so a script, a cron job and the tests can all use it.
 * Everything deleted here is short-lived by design. Nothing financial, no audit rows and no accounts are touched.
 */
export interface PurgePolicy {
  /** Rate-limit hits are only consulted inside windows of at most one hour, so a day is a very safe margin. */
  rateLimitHitMaxAgeHours: number;
  /** Codes expire in minutes; consumed or expired ones older than this have no further use. */
  otpCodeMaxAgeHours: number;
}

export const DEFAULT_PURGE_POLICY: PurgePolicy = { rateLimitHitMaxAgeHours: 24, otpCodeMaxAgeHours: 24 };

export interface PurgeResult {
  rateLimitHits: number;
  otpCodes: number;
  sessions: number;
}

export async function purgeExpiredAuthData(
  client: Pick<PrismaClient, "rateLimitHit" | "otpCode" | "session">,
  now: Date = new Date(),
  policy: PurgePolicy = DEFAULT_PURGE_POLICY,
): Promise<PurgeResult> {
  const hours = (n: number) => new Date(now.getTime() - n * 3_600_000);
  const [rateLimitHits, otpCodes, sessions] = await Promise.all([
    client.rateLimitHit.deleteMany({ where: { createdAt: { lt: hours(policy.rateLimitHitMaxAgeHours) } } }),
    client.otpCode.deleteMany({ where: { createdAt: { lt: hours(policy.otpCodeMaxAgeHours) } } }),
    client.session.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { rateLimitHits: rateLimitHits.count, otpCodes: otpCodes.count, sessions: sessions.count };
}
