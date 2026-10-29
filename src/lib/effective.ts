// Effective-dated values: a change never edits history, it adds a version that starts at a date.
// The value in force at time T is the newest version with effectiveFrom <= T.

export interface Versioned {
  effectiveFrom: Date;
  createdAt: Date;
}

export function pickEffective<T extends Versioned>(versions: readonly T[], at: Date): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (v.effectiveFrom.getTime() > at.getTime()) continue;
    if (!best) {
      best = v;
      continue;
    }
    const sameStart = v.effectiveFrom.getTime() === best.effectiveFrom.getTime();
    const newer = v.effectiveFrom.getTime() > best.effectiveFrom.getTime();
    // Same start date: the version created last wins (this is how a scheduled change is corrected).
    if (newer || (sameStart && v.createdAt.getTime() > best.createdAt.getTime())) best = v;
  }
  return best;
}

export const MAX_DAYS_AHEAD = 365;

export type EffectiveFromResult = { ok: true; date: Date } | { ok: false; error: "INVALID_DATE" | "IN_PAST" | "TOO_FAR" };

/**
 * Empty input means "now". A given date must be in the future: backdating would rewrite
 * the meaning of past orders, so it is refused.
 */
export function parseEffectiveFrom(raw: string | null | undefined, now: Date): EffectiveFromResult {
  if (raw === null || raw === undefined || raw.trim() === "") return { ok: true, date: now };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "INVALID_DATE" };
  if (date.getTime() < now.getTime()) return { ok: false, error: "IN_PAST" };
  if (date.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return { ok: false, error: "TOO_FAR" };
  return { ok: true, date };
}
