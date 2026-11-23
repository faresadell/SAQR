import "server-only";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** The Neon endpoint id of a connection string (e.g. "ep-quiet-sky-123456"), never the user, password or full address. */
export function endpointId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const first = new URL(url).hostname.split(".")[0] ?? "";
    return first.replace(/-pooler$/, "") || null;
  } catch {
    return null;
  }
}

export interface SystemCheck {
  runtimeEndpoint: string | null;
  migrateEndpoint: string | null;
  database: string | null;
  users: number;
  newestUserAt: Date | null;
  newestCodeAt: Date | null;
  sendFailures7d: number;
  lastFailures: { at: Date; reason: string }[];
  emailProvider: string;
  hasApiKey: boolean;
  fromDomain: string | null;
  appUrl: string;
  deployment: string | null;
  registerAttempts: { at: Date; outcome: string }[];
}

/** What this running deployment is actually connected to and configured with. Names and counts only: no secret value is returned. */
export async function systemCheck(): Promise<SystemCheck> {
  const env = getEnv();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [dbRow, users, newestUser, newestCode, failures7d, failures, attempts] = await Promise.all([
    db.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`,
    db.user.count(),
    db.user.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.emailCode.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.auditLog.count({ where: { action: "EMAIL_SEND_FAILED", createdAt: { gte: since } } }),
    db.auditLog.findMany({ where: { action: "EMAIL_SEND_FAILED" }, orderBy: { createdAt: "desc" }, take: 3, select: { createdAt: true, after: true } }),
    db.auditLog.findMany({ where: { action: "REGISTER_ATTEMPT" }, orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, after: true } }),
  ]);
  const fromMatch = /@([^<>\s@]+)>?\s*$/.exec(env.EMAIL_FROM ?? "");
  return {
    runtimeEndpoint: endpointId(process.env.DATABASE_URL),
    migrateEndpoint: endpointId(process.env.DATABASE_URL_UNPOOLED),
    database: dbRow[0]?.db ?? null,
    users,
    newestUserAt: newestUser?.createdAt ?? null,
    newestCodeAt: newestCode?.createdAt ?? null,
    sendFailures7d: failures7d,
    lastFailures: failures.map((f) => ({ at: f.createdAt, reason: String((f.after as { reason?: unknown } | null)?.reason ?? "") })),
    emailProvider: env.EMAIL_PROVIDER,
    hasApiKey: Boolean(env.RESEND_API_KEY),
    fromDomain: fromMatch?.[1] ?? null,
    appUrl: env.APP_URL,
    registerAttempts: attempts.map((a) => ({ at: a.createdAt, outcome: String((a.after as { outcome?: unknown } | null)?.outcome ?? "") })),
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
}
