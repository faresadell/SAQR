import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/tokens";
import type { RoleName } from "@/lib/auth/permissions";

const isProd = process.env.NODE_ENV === "production";
// The __Host- prefix forces Secure + Path=/ + no Domain, so the cookie cannot be overwritten by subdomains.
const SESSION_COOKIE = isProd ? "__Host-saqr_session" : "saqr_session";
const PENDING_COOKIE = isProd ? "__Host-saqr_pending" : "saqr_pending";
const PENDING_MAX_AGE_SECONDS = 15 * 60;

const baseCookie = { httpOnly: true, secure: isProd, sameSite: "lax" as const, path: "/" };

export interface SessionUser {
  sessionId: string;
  user: {
    id: string;
    name: string;
    phone: string;
    role: RoleName;
    isSuperAdmin: boolean;
    permissions: string[];
  };
}

/** Always issues a brand-new token (prevents session fixation). */
export async function createSession(user: { id: string; role: Role }, ip: string): Promise<void> {
  const ttlHours = await getSetting(user.role === "ADMIN" ? "auth.session.admin_ttl_hours" : "auth.session.ttl_hours");
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  const token = generateSessionToken();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      ip: ip === "unknown" ? null : ip,
      userAgent,
      expiresAt,
    },
  });
  await db.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  (await cookies()).set(SESSION_COOKIE, token, { ...baseCookie, expires: expiresAt });
}

export const getCurrentSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { admin: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  // A suspended or unverified account loses access immediately, even with a valid cookie.
  if (session.user.status !== "ACTIVE") return null;

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      phone: session.user.phone,
      role: session.user.role,
      isSuperAdmin: session.user.isSuperAdmin,
      permissions: session.user.admin.map((p) => p.permission),
    },
  };
});

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  store.delete(SESSION_COOKIE);
}

// The phone being verified is kept in a short-lived httpOnly cookie instead of the URL (keeps it out of logs).
export async function setPendingPhone(phone: string): Promise<void> {
  (await cookies()).set(PENDING_COOKIE, phone, { ...baseCookie, maxAge: PENDING_MAX_AGE_SECONDS });
}

export async function getPendingPhone(): Promise<string | null> {
  return (await cookies()).get(PENDING_COOKIE)?.value ?? null;
}

export async function clearPendingPhone(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}
