/** Changing the password while signed in (real PostgreSQL). WARNING: truncates tables. Use a throwaway database. */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePassword } from "@/server/auth/change-password";
import type { Actor } from "@/lib/auth/permissions";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

let me: Actor;
let keep: string;
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","StarAccount","User" RESTART IDENTITY CASCADE');
  const u = await db.user.create({ data: { phone: "+201011111111", name: "أحمد", passwordHash: await hashPassword("Sturdy-pass-91"), role: "CUSTOMER", status: "ACTIVE" } });
  me = { id: u.id, role: "CUSTOMER", isSuperAdmin: false, permissions: [] };
  const exp = new Date(Date.now() + 3_600_000);
  keep = (await db.session.create({ data: { userId: u.id, tokenHash: "a".repeat(64), expiresAt: exp } })).id;
  await db.session.create({ data: { userId: u.id, tokenHash: "b".repeat(64), expiresAt: exp } });
});

describe("change password", () => {
  it("refuses a wrong current password, the same password and a weak one, changing nothing", async () => {
    expect(await changePassword(me, keep, "wrong-pass-123", "Another-pass-77", "1.1.1.1")).toEqual({ ok: false, error: "WRONG_PASSWORD" });
    expect(await changePassword(me, keep, "Sturdy-pass-91", "Sturdy-pass-91", "1.1.1.1")).toEqual({ ok: false, error: "SAME_PASSWORD" });
    expect(await changePassword(me, keep, "Sturdy-pass-91", "12345678", "1.1.1.1")).toMatchObject({ ok: false, error: "WEAK" });
    const row = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("Sturdy-pass-91", row.passwordHash)).toBe(true);
    expect(await db.session.count({ where: { userId: me.id } })).toBe(2);
  });
  it("changes it, keeps only the current session and audits", async () => {
    expect(await changePassword(me, keep, "Sturdy-pass-91", "Another-pass-77", "1.1.1.1")).toEqual({ ok: true });
    const row = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("Another-pass-77", row.passwordHash)).toBe(true);
    const sessions = await db.session.findMany({ where: { userId: me.id } });
    expect(sessions.map((s) => s.id)).toEqual([keep]);
    expect(await db.auditLog.count({ where: { action: "PASSWORD_CHANGED", entityId: me.id } })).toBe(1);
  });
});
