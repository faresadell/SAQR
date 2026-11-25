import "server-only";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
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

export type DeleteUserResult = { ok: true; mode: "DELETED" | "ANONYMIZED" };

/**
 * Delete an account. A brand-new account with no history is removed completely. An account that already has orders, stars, a shop or
 * deliveries cannot be erased without breaking other people's order history and the money ledger, so it is anonymised instead:
 * name, phone, email and password are replaced, every session is revoked, the shop is hidden and the driver is switched off.
 * Either way the person can never sign in again and the phone and email become free for a new sign-up.
 */
export async function deleteUserByAdmin(actor: SessionUser, targetId: string, reason: string, ip: string): Promise<DeleteUserResult> {
  if (!hasPermission(actor.user, "users.manage")) throw new AuthorizationError();
  if (actor.user.id === targetId) throw new AuthorizationError("Admins cannot delete their own account");
  if (reason.trim().length < 3) throw new Error("A reason is required");
  const clean = reason.trim().slice(0, 300);

  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) throw new NotFoundError();
  if (target.isSuperAdmin) throw new AuthorizationError();
  if (target.role === "ADMIN" && !actor.user.isSuperAdmin) throw new AuthorizationError();

  try {
    await db.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: targetId } });
      await writeAudit({ actorId: actor.user.id, action: "USER_DELETED", entityType: "User", entityId: targetId, before: { role: target.role, status: target.status }, after: { mode: "DELETED", reason: clean }, ip }, tx);
    });
    return { ok: true, mode: "DELETED" };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003") throw error;
  }

  const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));
  await db.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: targetId } });
    await tx.adminPermission.deleteMany({ where: { userId: targetId } });
    await tx.user.update({
      where: { id: targetId },
      data: { name: "حساب محذوف", phone: `deleted-${targetId}`, email: null, emailVerifiedAt: null, phoneVerifiedAt: null, passwordHash, status: "SUSPENDED", totpSecretEnc: null },
    });
    await tx.merchant.updateMany({ where: { ownerId: targetId }, data: { status: "SUSPENDED" } });
    await tx.driver.updateMany({ where: { userId: targetId }, data: { isActive: false, isOnline: false } });
    await writeAudit({ actorId: actor.user.id, action: "USER_DELETED", entityType: "User", entityId: targetId, before: { role: target.role, status: target.status }, after: { mode: "ANONYMIZED", reason: clean }, ip }, tx);
  });
  return { ok: true, mode: "ANONYMIZED" };
}
