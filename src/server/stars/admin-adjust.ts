import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { applyStarMove, InsufficientStarsError } from "@/server/stars/ledger";

export const MAX_ADMIN_STARS = 100_000;
export type AdjustStarsResult = { ok: true; balanceAfter: number } | { ok: false; error: "INVALID_AMOUNT" | "INVALID_NOTE" | "BELOW_ZERO" };

/**
 * An administrator adds stars to (or takes stars from) any customer, merchant or driver account, with a written reason.
 * It goes through the one ledger function (reason ADMIN_CORRECTION), so the balance can never go below zero and every change is audited.
 */
export async function adjustStarsByAdmin(actor: SessionUser, userId: string, amount: number, note: string, ip: string): Promise<AdjustStarsResult> {
  if (!hasPermission(actor.user, "users.manage")) throw new AuthorizationError();
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADMIN_STARS) return { ok: false, error: "INVALID_AMOUNT" };
  const clean = note.trim();
  if (clean.length < 3 || clean.length > 200) return { ok: false, error: "INVALID_NOTE" };
  try {
    return await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
      if (!target) throw new NotFoundError();
      if (target.role === "ADMIN") throw new AuthorizationError("Admins have no star balance");
      const moved = await applyStarMove(tx, { userId, amount, reason: "ADMIN_CORRECTION", actorId: actor.user.id, note: clean, idempotencyKey: `admin-adjust:${randomUUID()}` });
      await writeAudit({ actorId: actor.user.id, action: "STARS_ADJUSTED_BY_ADMIN", entityType: "User", entityId: userId, after: { amount, note: clean, balanceAfter: moved.balanceAfter }, ip }, tx);
      return { ok: true as const, balanceAfter: moved.balanceAfter };
    });
  } catch (error) {
    if (error instanceof InsufficientStarsError) return { ok: false, error: "BELOW_ZERO" };
    throw error;
  }
}
