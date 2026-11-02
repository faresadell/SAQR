/**
 * Sign-up with email activation (real PostgreSQL). WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 * No SMS exists: the account is activated only by the code sent to its email (a fake sender captures it here).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { authenticate, completeEmailActivation, registerAccount, resendActivationCode } from "@/server/auth/auth-service";
import { setEmailSenderForTests } from "@/server/auth/email-sender";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const mails: { to: string; purpose: string; code: string }[] = [];
const base = { name: "أحمد علي", phone: "+201012345678", email: "ahmed@example.com", password: "Sturdy-pass-91", role: "CUSTOMER" as const };

beforeEach(async () => {
  mails.length = 0;
  setEmailSenderForTests({ send: async (to, purpose, code) => void mails.push({ to, purpose, code }) });
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","Driver","StarAccount","User" RESTART IDENTITY CASCADE');
});
afterEach(() => setEmailSenderForTests(undefined));

describe("sign-up and activation by email code", () => {
  it("creates a pending account, mails a code to the given address, and activates only with that code", async () => {
    expect(await registerAccount(base, "unknown")).toEqual({ ok: true });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "ahmed@example.com", purpose: "VERIFY_EMAIL" });
    const pending = await db.user.findUniqueOrThrow({ where: { phone: base.phone } });
    expect(pending).toMatchObject({ status: "PENDING", email: "ahmed@example.com", name: "أحمد علي", role: "CUSTOMER", emailVerifiedAt: null });
    expect(await authenticate({ phone: base.phone, password: base.password }, "unknown")).toEqual({ ok: false, error: "NEEDS_VERIFICATION" }); // cannot sign in before activation
    expect(await completeEmailActivation(base.phone, "000000", "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    const done = await completeEmailActivation(base.phone, mails[0]!.code, "unknown");
    expect(done).toMatchObject({ ok: true, user: { role: "CUSTOMER" } });
    const active = await db.user.findUniqueOrThrow({ where: { phone: base.phone } });
    expect(active.status).toBe("ACTIVE");
    expect(active.emailVerifiedAt).not.toBeNull();
    expect(active.phoneVerifiedAt).toBeNull(); // the phone is a contact number, not proven by a code
    expect(await db.starAccount.count({ where: { userId: active.id } })).toBe(1);
    expect(await completeEmailActivation(base.phone, mails[0]!.code, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" }); // single use
    expect((await authenticate({ phone: base.phone, password: base.password }, "unknown")).ok).toBe(true);
  });

  it("merchants and drivers sign up the same way; a driver gets no shop", async () => {
    await registerAccount({ ...base, role: "DRIVER", phone: "+201022222222", email: "d@example.com" }, "unknown");
    const r = await completeEmailActivation("+201022222222", mails[0]!.code, "unknown");
    expect(r).toMatchObject({ ok: true, user: { role: "DRIVER" } });
    await registerAccount({ ...base, role: "MERCHANT", phone: "+201033333333", email: "m@example.com" }, "unknown");
    expect(await completeEmailActivation("+201033333333", mails[1]!.code, "unknown")).toMatchObject({ ok: true, user: { role: "MERCHANT" } });
  });

  it("answers the same, and sends nothing, when the phone or the email already belongs to an active account", async () => {
    await registerAccount(base, "unknown");
    await completeEmailActivation(base.phone, mails[0]!.code, "unknown");
    mails.length = 0;
    expect(await registerAccount({ ...base, name: "منتحل", password: "Other-pass-77" }, "unknown")).toEqual({ ok: true }); // same phone and email
    expect(await registerAccount({ ...base, phone: "+201099999999" }, "unknown")).toEqual({ ok: true }); // same email, new phone
    expect(await registerAccount({ ...base, email: "other@example.com" }, "unknown")).toEqual({ ok: true }); // same phone, new email
    expect(mails).toHaveLength(0);
    const u = await db.user.findUniqueOrThrow({ where: { phone: base.phone } });
    expect(u.name).toBe("أحمد علي"); // not overwritten
    expect((await authenticate({ phone: base.phone, password: base.password }, "unknown")).ok).toBe(true);
    expect(await db.user.count()).toBe(1);
  });

  it("a pending account can be re-registered with the same phone (new email/password), the old code stops working", async () => {
    await registerAccount(base, "unknown");
    await db.emailCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    await registerAccount({ ...base, email: "new@example.com", password: "Better-pass-55" }, "unknown");
    expect(mails.map((m) => m.to)).toEqual(["ahmed@example.com", "new@example.com"]);
    const [oldCode, newCode] = [mails[0]!.code, mails[1]!.code];
    if (oldCode !== newCode) expect(await completeEmailActivation(base.phone, oldCode, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect((await completeEmailActivation(base.phone, newCode, "unknown")).ok).toBe(true);
    expect((await authenticate({ phone: base.phone, password: "Better-pass-55" }, "unknown")).ok).toBe(true);
    expect((await authenticate({ phone: base.phone, password: base.password }, "unknown")).ok).toBe(false);
  });

  it("a pending driver account created by a shop cannot be taken over by a stranger", async () => {
    const owner = await db.user.create({ data: { phone: "+201055555555", name: "o", passwordHash: "x", role: "MERCHANT", status: "ACTIVE" } });
    await db.businessType.upsert({ where: { code: "restaurant" }, update: {}, create: { code: "restaurant", nameAr: "مطعم" } });
    const shop = await db.merchant.create({ data: { ownerId: owner.id, name: "S", businessType: "restaurant", status: "APPROVED" } });
    const driverUser = await db.user.create({ data: { phone: "+201066666666", name: "سواق", passwordHash: await hashPassword("Temp-pass-1234"), role: "DRIVER", status: "PENDING" } });
    await db.driver.create({ data: { userId: driverUser.id, merchantId: shop.id } });
    expect(await registerAccount({ ...base, role: "DRIVER", phone: "+201066666666", email: "thief@example.com" }, "unknown")).toEqual({ ok: true });
    expect(mails).toHaveLength(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: driverUser.id } })).email).toBeNull();
  });

  it("limits wrong guesses, expired codes, and resends neutrally", async () => {
    await registerAccount(base, "unknown");
    const good = mails[0]!.code;
    const wrong = good === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i += 1) await completeEmailActivation(base.phone, wrong, "unknown");
    expect(await completeEmailActivation(base.phone, good, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" }); // attempts used up
    await db.emailCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    expect(await resendActivationCode(base.phone, "unknown")).toEqual({ ok: true });
    expect(mails).toHaveLength(2);
    await db.emailCode.updateMany({ where: { consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await completeEmailActivation(base.phone, mails[1]!.code, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" }); // expired
    expect(await resendActivationCode("+201000000000", "unknown")).toEqual({ ok: true }); // unknown phone: same answer, nothing sent
    expect(mails).toHaveLength(2);
  });

  it("a provider failure is reported and leaves no usable code", async () => {
    setEmailSenderForTests({ send: async () => { throw new Error("provider down"); } });
    expect(await registerAccount(base, "unknown")).toEqual({ ok: false, error: "SEND_FAILED" });
    expect(await db.emailCode.count({ where: { consumedAt: null } })).toBe(0);
  });
});
