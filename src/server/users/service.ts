import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";

/**
 * Suspend or reactivate an account. Authorization is checked here, on the server, every time.
 * Suspension revokes all sessions immediately and every change is written to the audit trail.
 */
export async function setUserStatus(
  actor: SessionUser,
  targetId: string,
  next: "ACTIVE" | "SUSPENDED",
  reason: string,
  ip: string,
): Promise<void> {
  if (!hasPermission(actor.user, "users.manage")) throw new AuthorizationError();
  if (actor.user.id === targetId) throw new AuthorizationError("Admins cannot change their own status");
  if (reason.trim().length < 3) throw new Error("A reason is required");

  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundError();
    // The main administrator can never be suspended here; only super admins can act on other admins.
    if (target.isSuperAdmin) throw new AuthorizationError();
    if (target.role === "ADMIN" && !actor.user.isSuperAdmin) throw new AuthorizationError();

    const status = next === "ACTIVE" && !target.phoneVerifiedAt ? "PENDING" : next;
    await tx.user.update({ where: { id: target.id }, data: { status } });
    if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId: target.id } });

    await writeAudit(
      {
        actorId: actor.user.id,
        action: next === "SUSPENDED" ? "USER_SUSPENDED" : "USER_REACTIVATED",
        entityType: "User",
        entityId: target.id,
        before: { status: target.status },
        after: { status, reason: reason.trim() },
        ip,
      },
      tx,
    );
  });
}
