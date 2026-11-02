/**
 * Password-reset hardening across BOTH working channels (email code and phone code): expiry, single use, newest code only,
 * guess limits, request/confirm rate limits, and no way to tell whether an account exists. Real PostgreSQL.
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 * There is no SMS provider; the phone path is tested through the development sender's log line only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { authenticate } from "@/server/auth/auth-service";
import { confirmPasswordResetByEmail, requestPasswordResetByEmail } from "@/server/auth/email-account";
import { setEmailSenderForTests } from "@/server/auth/email-sender";
import { confirmPasswordReset, requestPasswordReset } from "@/server/auth/password-reset";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const emails: { to: string; purpose: string; code: string }[] = [];
let n = 0;

async function account(opts: { status?: "ACTIVE" | "SUSPENDED" } = {}) {
  n += 1;
  const phone = `+2012${String(n).padStart(8, "0")}`;
  const email = `u${n}@example.com`;
  const u = await db.user.create({
    data: { phone, email, name: `U${n}`, passwordHash: await hashPassword("Old-pass-12345"), role: "CUSTOMER", status: opts.status ?? "ACTIVE", phoneVerifiedAt: new Date(), emailVerifiedAt: new Date() },
  });
  return { u, phone, email };
}

/** Moves the newest code of this user back in time so the resend cooldown does not hide a second request. */
const ageCodes = async (userId: string) => void (await db.emailCode.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 120_000) } }));
const agePhoneCodes = async (phone: string) => void (await db.otpCode.updateMany({ where: { phone }, data: { createdAt: new Date(Date.now() - 120_000) } }));

function phoneCodes() {
  const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  return () => spy.mock.calls.map((c) => /code for \S+: (\d{6})/.exec(String(c[0]))?.[1]).filter((x): x is string => !!x);
}

beforeEach(async () => {
  emails.length = 0;
  setEmailSenderForTests({ send: async (to, purpose, code) => void emails.push({ to, purpose, code }) });
  await db.$executeRawUnsafe('TRUNCATE "OtpCode","RateLimitHit","Session","AuditLog","User" RESTART IDENTITY CASCADE');
});
afterEach(() => {
  setEmailSenderForTests(undefined);
  vi.restoreAllMocks();
});

describe("reset by email", () => {
  it("refuses an expired code and does not change the password", async () => {
    const a = await account();
    await requestPasswordResetByEmail(a.email, "unknown");
    await db.emailCode.updateMany({ where: { userId: a.u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await confirmPasswordResetByEmail(a.email, emails[0]!.code, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect((await authenticate({ phone: a.phone, password: "Old-pass-12345" }, "unknown")).ok).toBe(true);
  });

  it("only the newest code works; asking again inside the cooldown sends nothing new", async () => {
    const a = await account();
    await requestPasswordResetByEmail(a.email, "unknown");
    await requestPasswordResetByEmail(a.email, "unknown");
    expect(emails).toHaveLength(1);
    await ageCodes(a.u.id);
    await requestPasswordResetByEmail(a.email, "unknown");
    expect(emails).toHaveLength(2);
    const [oldCode, newCode] = [emails[0]!.code, emails[1]!.code];
    if (oldCode !== newCode) expect(await confirmPasswordResetByEmail(a.email, oldCode, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect(await confirmPasswordResetByEmail(a.email, newCode, "New-pass-98765", "unknown")).toEqual({ ok: true });
  });

  it("stops guessing after the attempt limit even if the right code is then sent", async () => {
    const a = await account();
    await requestPasswordResetByEmail(a.email, "unknown");
    const good = emails[0]!.code;
    const wrong = good === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i += 1) await confirmPasswordResetByEmail(a.email, wrong, "New-pass-98765", "unknown");
    expect(await confirmPasswordResetByEmail(a.email, good, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect((await authenticate({ phone: a.phone, password: "Old-pass-12345" }, "unknown")).ok).toBe(true);
  });

  it("two simultaneous confirmations with the same code succeed only once", async () => {
    const a = await account();
    await requestPasswordResetByEmail(a.email, "unknown");
    const code = emails[0]!.code;
    const results = await Promise.all([
      confirmPasswordResetByEmail(a.email, code, "First-pass-1111", "unknown"),
      confirmPasswordResetByEmail(a.email, code, "Second-pass-2222", "unknown"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "PASSWORD_RESET", entityId: a.u.id } })).toBe(1);
  });

  it("limits confirm attempts per address and sends nothing more to a suspended account", async () => {
    const a = await account();
    await requestPasswordResetByEmail(a.email, "unknown");
    for (let i = 0; i < 10; i += 1) await confirmPasswordResetByEmail(a.email, "000000", "New-pass-98765", "unknown");
    expect(await confirmPasswordResetByEmail(a.email, emails[0]!.code, "New-pass-98765", "unknown")).toEqual({ ok: false, error: "RATE_LIMITED" });
    const s = await account({ status: "SUSPENDED" });
    expect(await requestPasswordResetByEmail(s.email, "unknown")).toEqual({ ok: true });
    expect(emails.filter((e) => e.to === s.email)).toHaveLength(0);
  });

  it("answers an unknown and a real address identically, including after the per-account hourly cap", async () => {
    const a = await account();
    for (let i = 0; i < 7; i += 1) {
      expect(await requestPasswordResetByEmail(a.email, "unknown")).toEqual({ ok: true }); // real: never says "too many" for the account itself
      expect(await requestPasswordResetByEmail("nobody@example.com", "unknown")).toEqual({ ok: true });
      await ageCodes(a.u.id);
    }
    expect(emails.length).toBeLessThanOrEqual(5); // but the cap really stopped sending
    expect(emails.length).toBeGreaterThan(0);
  });

  it("a wrong address with a weak password reveals nothing different from a right one", async () => {
    const a = await account();
    const real = await confirmPasswordResetByEmail(a.email, "000000", "12345678", "unknown");
    const fake = await confirmPasswordResetByEmail("ghost@example.com", "000000", "12345678", "unknown");
    expect(real).toEqual(fake);
  });

  it("throttles one IP probing many addresses", async () => {
    for (let i = 0; i < 20; i += 1) expect(await requestPasswordResetByEmail(`x${i}@example.com`, "9.9.9.9")).toEqual({ ok: true });
    expect(await requestPasswordResetByEmail("x99@example.com", "9.9.9.9")).toEqual({ ok: false, error: "RATE_LIMITED" });
  });
});

describe("reset by phone code", () => {
  it("refuses an expired code, an exhausted code, and a code reused after success", async () => {
    const codes = phoneCodes();
    const a = await account();
    await requestPasswordReset(a.phone, "unknown");
    await db.otpCode.updateMany({ where: { phone: a.phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await confirmPasswordReset(a.phone, codes()[0]!, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });

    await agePhoneCodes(a.phone);
    await requestPasswordReset(a.phone, "unknown");
    const good = codes()[1]!;
    const wrong = good === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i += 1) await confirmPasswordReset(a.phone, wrong, "New-pass-98765", "unknown");
    expect(await confirmPasswordReset(a.phone, good, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });

    await agePhoneCodes(a.phone);
    await db.rateLimitHit.deleteMany({});
    await requestPasswordReset(a.phone, "unknown");
    const fresh = codes()[2]!;
    expect(await confirmPasswordReset(a.phone, fresh, "New-pass-98765", "unknown")).toEqual({ ok: true });
    expect(await confirmPasswordReset(a.phone, fresh, "Again-pass-4444", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
  });

  it("only the newest phone code works and a suspended account gets none", async () => {
    const codes = phoneCodes();
    const a = await account();
    await requestPasswordReset(a.phone, "unknown");
    await agePhoneCodes(a.phone);
    await requestPasswordReset(a.phone, "unknown");
    const [oldCode, newCode] = codes() as [string, string];
    if (oldCode !== newCode) expect(await confirmPasswordReset(a.phone, oldCode, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect(await confirmPasswordReset(a.phone, newCode, "New-pass-98765", "unknown")).toEqual({ ok: true });
    const s = await account({ status: "SUSPENDED" });
    const before = codes().length;
    expect(await requestPasswordReset(s.phone, "unknown")).toEqual({ ok: true });
    expect(codes().length).toBe(before);
  });

  it("limits confirm attempts per number and answers real and unknown numbers the same way", async () => {
    const a = await account();
    for (let i = 0; i < 10; i += 1) await confirmPasswordReset(a.phone, "000000", "New-pass-98765", "unknown");
    expect(await confirmPasswordReset(a.phone, "000000", "New-pass-98765", "unknown")).toEqual({ ok: false, error: "RATE_LIMITED" });
    const real = await requestPasswordReset(a.phone, "unknown");
    const fake = await requestPasswordReset("01099999999", "unknown");
    expect(real).toEqual(fake);
  });
});
