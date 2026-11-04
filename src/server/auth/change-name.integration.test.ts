/** Changing the display name (real PostgreSQL). WARNING: truncates tables. Use a throwaway database. */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { changeName, cleanDisplayName } from "@/server/auth/change-name";
import type { Actor } from "@/lib/auth/permissions";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

let me: Actor;
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","StarAccount","User" RESTART IDENTITY CASCADE');
  const u = await db.user.create({ data: { phone: "+201011111111", name: "أحمد", passwordHash: await hashPassword("Sturdy-pass-91"), role: "CUSTOMER", status: "ACTIVE" } });
  me = { id: u.id, role: "CUSTOMER", isSuperAdmin: false, permissions: [] };
});

describe("change name", () => {
  it("cleans the name", () => {
    expect(cleanDisplayName("  أحمد   علي ")).toBe("أحمد علي");
    expect(cleanDisplayName("ا")).toBeNull();
    expect(cleanDisplayName("x".repeat(61))).toBeNull();
    expect(cleanDisplayName("bad\u0000name")).toBeNull();
  });
  it("renames and audits before/after; the same name or a bad name changes nothing", async () => {
    expect(await changeName(me, "أحمد")).toEqual({ ok: false, error: "SAME_NAME" });
    expect(await changeName(me, " ")).toEqual({ ok: false, error: "INVALID_NAME" });
    expect(await changeName(me, "أحمد  محمود")).toEqual({ ok: true, name: "أحمد محمود" });
    expect((await db.user.findUniqueOrThrow({ where: { id: me.id } })).name).toBe("أحمد محمود");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "NAME_CHANGED", entityId: me.id } });
    expect(audit.before).toEqual({ name: "أحمد" });
    expect(audit.after).toEqual({ name: "أحمد محمود" });
  });
});
