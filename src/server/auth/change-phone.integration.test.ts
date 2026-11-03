/** Changing the contact phone (real PostgreSQL). WARNING: truncates tables. Use a throwaway database. */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { changePhone } from "@/server/auth/change-phone";
import type { Actor } from "@/lib/auth/permissions";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const PASSWORD = "Sturdy-pass-91";
let me: Actor;

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","StarAccount","User" RESTART IDENTITY CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const u = await db.user.create({ data: { phone: "+201011111111", name: "أحمد", passwordHash, role: "CUSTOMER", status: "ACTIVE", phoneVerifiedAt: new Date() } });
  await db.user.create({ data: { phone: "+201022222222", name: "سارة", passwordHash, role: "CUSTOMER", status: "ACTIVE" } });
  me = { id: u.id, role: "CUSTOMER", isSuperAdmin: false, permissions: [] };
});

describe("change phone", () => {
  it("needs the current password: wrong password changes nothing and writes no audit row", async () => {
    expect(await changePhone(me, "01033333333", "Wrong-pass-00", "unknown")).toEqual({ ok: false, error: "WRONG_PASSWORD" });
    expect((await db.user.findUniqueOrThrow({ where: { id: me.id } })).phone).toBe("+201011111111");
    expect(await db.auditLog.count({ where: { action: "PHONE_CHANGED" } })).toBe(0);
  });

  it("changes the number with the right password, marks it unverified and audits old and new", async () => {
    expect(await changePhone(me, "01033333333", PASSWORD, "unknown")).toEqual({ ok: true, phone: "+201033333333" });
    const row = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(row.phone).toBe("+201033333333");
    expect(row.phoneVerifiedAt).toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "PHONE_CHANGED", entityId: me.id } });
    expect(audit.before).toEqual({ phone: "+201011111111" });
    expect(audit.after).toEqual({ phone: "+201033333333" });
  });

  it("rejects an invalid number, the same number and a number held by another account", async () => {
    expect(await changePhone(me, "123", PASSWORD, "unknown")).toEqual({ ok: false, error: "INVALID_PHONE" });
    expect(await changePhone(me, "01011111111", PASSWORD, "unknown")).toEqual({ ok: false, error: "SAME_PHONE" });
    expect(await changePhone(me, "01022222222", PASSWORD, "unknown")).toEqual({ ok: false, error: "PHONE_TAKEN" });
    expect((await db.user.findUniqueOrThrow({ where: { id: me.id } })).phone).toBe("+201011111111");
  });

  it("limits password guessing", async () => {
    let last: unknown;
    for (let i = 0; i < 12; i++) last = await changePhone(me, "01033333333", "Wrong-pass-00", "unknown");
    expect(last).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(await changePhone(me, "01033333333", PASSWORD, "unknown")).toEqual({ ok: false, error: "RATE_LIMITED" }); // even the right one is held
  });
});
