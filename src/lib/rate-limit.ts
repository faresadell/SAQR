import "server-only";
import { db } from "@/lib/db";

/**
 * Sliding-window limiter stored in PostgreSQL so it works across server instances.
 * Returns true when the action is allowed (and records it), false when the limit is reached.
 * Calls for the same key are serialized with a transaction-scoped advisory lock, so a burst of parallel requests cannot all read "below the limit".
 * Per-OTP attempt limits are enforced separately with atomic updates.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const count = await tx.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
    if (count >= limit) return false;
    await tx.rateLimitHit.create({ data: { key } });
    return true;
  });
}
