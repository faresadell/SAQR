/** First-administrator setup (real PostgreSQL). WARNING: truncates tables. Use a throwaway database. */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createFirstAdmin, isSetupOpen } from "@/server/auth/bootstrap-admin";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.SETUP_TOKEN = "t".repeat(40);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const good = { token: "t".repeat(40), phone: "01055555555", name: "مدير النظام", password: "Sturdy-pass-91x" };

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","StarAccount","User" RESTART IDENTITY CASCADE');
});

describe("first administrator setup", () => {
  it("is open only while no administrator exists", async () => {
    expect(await isSetupOpen()).toBe(true);
    expect((await createFirstAdmin(good, "1.1.1.1")).ok).toBe(true);
    expect(await isSetupOpen()).toBe(false);
  });
  it("refuses a wrong token, a bad phone, a short or weak password, and creates nothing", async () => {
    expect(await createFirstAdmin({ ...good, token: "x".repeat(40) }, "1.1.1.1")).toEqual({ ok: false, error: "WRONG_TOKEN" });
    expect(await createFirstAdmin({ ...good, phone: "123" }, "1.1.1.1")).toEqual({ ok: false, error: "INVALID_PHONE" });
    expect(await createFirstAdmin({ ...good, password: "short1A" }, "1.1.1.1")).toEqual({ ok: false, error: "SHORT_PASSWORD" });
    expect(await createFirstAdmin({ ...good, password: "123456789012" }, "1.1.1.1")).toEqual({ ok: false, error: "WEAK_PASSWORD" });
    expect(await db.user.count()).toBe(0);
  });
  it("creates an active super admin with an encrypted authenticator secret, audits it, and returns the key once", async () => {
    const result = await createFirstAdmin(good, "1.1.1.1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manualKey).toMatch(/^[A-Z2-7]+$/);
    expect(result.uri).toContain("otpauth://totp/");
    const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    expect(admin).toMatchObject({ phone: "+201055555555", status: "ACTIVE", isSuperAdmin: true });
    expect(admin.totpSecretEnc).toBeTruthy();
    expect(admin.totpSecretEnc).not.toContain(result.manualKey);
    expect(admin.passwordHash).not.toContain(good.password);
    expect(await db.auditLog.count({ where: { action: "ADMIN_CREATED", entityId: admin.id } })).toBe(1);
  });
  it("closes after the first admin and creates exactly one even when submitted twice at once", async () => {
    const [a, b] = await Promise.all([createFirstAdmin(good, "1.1.1.1"), createFirstAdmin({ ...good, phone: "01066666666" }, "2.2.2.2")]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(1);
    expect(await createFirstAdmin(good, "3.3.3.3")).toEqual({ ok: false, error: "ALREADY_SETUP" });
  });
  it("rate-limits guessing per address", async () => {
    for (let i = 0; i < 10; i++) await createFirstAdmin({ ...good, token: "x".repeat(40) }, "9.9.9.9");
    expect(await createFirstAdmin(good, "9.9.9.9")).toEqual({ ok: false, error: "RATE_LIMITED" });
  });
});
