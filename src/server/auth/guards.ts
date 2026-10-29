import "server-only";
import { notFound, redirect } from "next/navigation";
import { hasPermission, type Permission, type RoleName } from "@/lib/auth/permissions";
import { getCurrentSession, type SessionUser } from "./session";

/** Page and action guards. Every protected entry point must call one of these on the server. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

/** Wrong role looks like a missing page so protected routes are not revealed. */
export async function requireRole(...roles: RoleName[]): Promise<SessionUser> {
  const session = await requireUser();
  if (!roles.includes(session.user.role)) notFound();
  return session;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await requireUser();
  if (!hasPermission(session.user, permission)) notFound();
  return session;
}
