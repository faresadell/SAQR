import "server-only";
import { db } from "@/lib/db";

const DAY = 24 * 3_600_000;

/**
 * Removes rows that only ever matter for minutes or hours: rate-limit hits (windows are at most a day), codes that expired long ago,
 * and sessions that expired. Idempotent and safe to run often.
 */
export async function purgeOldRows(now = new Date()): Promise<Record<string, number>> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const [rateLimitHits, otpCodes, emailCodes, sessions] = await Promise.all([
    db.rateLimitHit.deleteMany({ where: { createdAt: { lt: ago(2) } } }),
    db.otpCode.deleteMany({ where: { expiresAt: { lt: ago(7) } } }),
    db.emailCode.deleteMany({ where: { expiresAt: { lt: ago(7) } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: ago(7) } } }),
  ]);
  return { rateLimitHits: rateLimitHits.count, otpCodes: otpCodes.count, emailCodes: emailCodes.count, sessions: sessions.count };
}
