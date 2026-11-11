/**
 * Behaviour tests for registration, one-time codes, phone verification, login (lockout, admin 2FA), sessions and
 * account suspension. They run against an in-memory stand-in for the database (src/test/fake-db.ts) with a frozen,
 * controllable clock, so they are fast and deterministic. The real SQL and constraints are covered separately by
 * the PostgreSQL integration tests (npm run test:integration).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReactModule from "react";
import type * as PasswordModule from "@/lib/auth/password";

const h = vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://u:p@localhost:5432/unit_test",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "s".repeat(48),
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    OTP_PROVIDER: "disabled",
  });
  return {
    jar: new Map<string, { value: string; options: Record<string, unknown> }>(),
    sms: [] as { phone: string; code: string; purpose: string }[],
    state: { failSend: false },
  };
});

vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("@/test/fake-db");
  return { db: createFakeDb() };
});
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof ReactModule>()), cache: <T>(fn: T) => fn }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => void h.jar.set(name, { value, options }),
    delete: (name: string) => void h.jar.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest-agent" }),
}));
vi.mock("@/server/auth/otp-sender", () => ({
  getOtpSender: () => ({
    send: async (phone: string, code: string, purpose: string) => {
      if (h.state.failSend) throw new Error("provider down");
      h.sms.push({ phone, code, purpose });
    },
  }),
}));
// Real scrypt costs ~0.3s per call; password hashing has its own tests, so use a fast stand-in here.
vi.mock("@/lib/auth/password", async (importOriginal) => ({
  ...(await importOriginal<typeof PasswordModule>()),
  hashPassword: async (p: string) => `fast$${p}`,
  verifyPassword: async (p: string, hash: string) => hash === `fast$${p}`,
  burnPasswordCheck: async () => undefined,
}));

import { db } from "@/lib/db";
import { encryptSecret, parseEncryptionKey } from "@/lib/auth/secret-box";
import { generateTotpSecret, TOTP_PERIOD_SECONDS, totpAt } from "@/lib/auth/totp";
import { SETTING_DEFINITIONS } from "@/lib/settings-registry";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { setUserStatus } from "@/server/users/service";
import type { FakeDb } from "@/test/fake-db";
import { authenticate, completePhoneVerification, registerAccount, resendSignupCode, type RegisterInput } from "./auth-service";
import { requestOtp, verifyOtp } from "./otp-service";
import { createSession, destroyCurrentSession, getCurrentSession, getPendingSignup, setPendingSignup, type SessionUser } from "./session";

const fake = db as unknown as FakeDb;
const PHONE = "+201012345678";
const PASSWORD = "correct horse 42";
const START = new Date("2026-11-12T10:00:00Z");

const advance = (seconds: number) => vi.setSystemTime(new Date(Date.now() + seconds * 1000));
const lastCode = (phone = PHONE) => [...h.sms].reverse().find((s) => s.phone === phone)?.code ?? "";
const wrongCodeFor = (code: string) => (code === "123456" ? "654321" : "123456");

async function register(over: Partial<RegisterInput> = {}, ip = "unknown") {
  return registerAccount({ name: "Sara", phone: PHONE, password: PASSWORD, role: "CUSTOMER", ...over }, ip);
}
async function registerOk(over: Partial<RegisterInput> = {}, ip = "unknown"): Promise<string> {
  const result = await register(over, ip);
  if (!result.ok) throw new Error(`register failed: ${result.error}`);
  return result.nonce;
}
async function createUser(over: Record<string, unknown> = {}) {
  return fake.user.create({
    data: { phone: PHONE, name: "User", passwordHash: `fast$${PASSWORD}`, role: "CUSTOMER", status: "ACTIVE", phoneVerifiedAt: new Date(), ...over },
  });
}
const userRow = (phone = PHONE) => fake.user.rows.find((r) => r.phone === phone);
const auditActions = () => fake.auditLog.rows.map((r) => r.action);

function adminActor(over: Partial<SessionUser["user"]> = {}): SessionUser {
  return { sessionId: "s1", user: { id: "admin-1", name: "Admin", phone: "+201000000099", role: "ADMIN", isSuperAdmin: false, permissions: ["users.manage"], ...over } };
}

beforeEach(() => {
  fake.reset();
  h.jar.clear();
  h.sms.length = 0;
  h.state.failSend = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("registration", () => {
  it("creates a pending account, sends one code and stores only a hash of the nonce", async () => {
    const nonce = await registerOk();
    const user = userRow();
    expect(user).toMatchObject({ status: "PENDING", role: "CUSTOMER", name: "Sara", phoneVerifiedAt: null });
    expect(user?.passwordHash).toBe(`fast$${PASSWORD}`); // the stand-in hasher; real hashing is tested in password.test.ts
    expect(user?.signupNonceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(user?.signupNonceHash).not.toContain(nonce);
    expect(user?.consentVersion).toBeTruthy();
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0]).toMatchObject({ phone: PHONE, purpose: "SIGNUP" });
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  it("answers identically for an already-registered phone and changes nothing about that account", async () => {
    await createUser({ name: "Original", role: "MERCHANT", passwordHash: "fast$original password 1" });
    const result = await register({ name: "Mallory", password: "attacker password 9", role: "CUSTOMER" });
    expect(result.ok).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["nonce", "ok"]); // same shape as a brand-new sign-up
    expect(userRow()).toMatchObject({ name: "Original", role: "MERCHANT", status: "ACTIVE", passwordHash: "fast$original password 1", signupNonceHash: null });
    expect(h.sms).toHaveLength(0); // no SMS for a number that already has an account
  });

  it("limits sign-ups per IP, but never blocks on an unknown IP", async () => {
    const limit = SETTING_DEFINITIONS["auth.register.max_per_ip_per_hour"].default;
    for (let i = 0; i < limit; i++) expect((await register({ phone: `+2010000${String(i).padStart(5, "0")}` }, "8.8.8.8")).ok).toBe(true);
    expect(await register({ phone: "+201099999999" }, "8.8.8.8")).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect((await register({ phone: "+201088888888" }, "unknown")).ok).toBe(true);
  });

  it("reports a failed SMS send", async () => {
    h.state.failSend = true;
    expect(await register()).toEqual({ ok: false, error: "SEND_FAILED" });
  });
});

describe("one-time codes", () => {
  it("issues a 6-digit code that is stored hashed and expires after the configured time", async () => {
    expect(await requestOtp(PHONE, "SIGNUP", "unknown")).toEqual({ ok: true });
    const code = lastCode();
    const stored = fake.otpCode.rows[0];
    expect(stored?.codeHash).not.toContain(code);
    expect((stored?.expiresAt as Date).getTime() - Date.now()).toBe(300_000);
    advance(301);
    expect(await verifyOtp(PHONE, "SIGNUP", code)).toBe(false);
  });

  it("accepts the right code once and only once", async () => {
    await requestOtp(PHONE, "SIGNUP", "unknown");
    const code = lastCode();
    expect(await verifyOtp(PHONE, "SIGNUP", code)).toBe(true);
    expect(await verifyOtp(PHONE, "SIGNUP", code)).toBe(false);
  });

  it("is bound to its purpose and rejects malformed input without counting an attempt", async () => {
    await requestOtp(PHONE, "SIGNUP", "unknown");
    const code = lastCode();
    expect(await verifyOtp(PHONE, "LOGIN" as never, code)).toBe(false);
    for (const bad of ["", "12345", "1234567", "abcdef", " 123456"]) expect(await verifyOtp(PHONE, "SIGNUP", bad)).toBe(false);
    expect(fake.otpCode.rows[0]?.attempts).toBe(0);
    expect(await verifyOtp(PHONE, "SIGNUP", code)).toBe(true);
  });

  it("locks the code after too many wrong guesses, even if the right one comes next", async () => {
    await requestOtp(PHONE, "SIGNUP", "unknown");
    const code = lastCode();
    const wrong = wrongCodeFor(code);
    const max = SETTING_DEFINITIONS["auth.otp.max_attempts"].default;
    for (let i = 0; i < max; i++) expect(await verifyOtp(PHONE, "SIGNUP", wrong)).toBe(false);
    expect(await verifyOtp(PHONE, "SIGNUP", code)).toBe(false);
  });

  it("only honours the newest code after a resend", async () => {
    await requestOtp(PHONE, "SIGNUP", "unknown");
    const first = lastCode();
    advance(61);
    await requestOtp(PHONE, "SIGNUP", "unknown");
    const second = lastCode();
    expect(h.sms).toHaveLength(2);
    if (first !== second) expect(await verifyOtp(PHONE, "SIGNUP", first)).toBe(false);
    expect(await verifyOtp(PHONE, "SIGNUP", second)).toBe(true);
  });

  it("does not send a second SMS inside the resend cooldown, and still answers neutrally", async () => {
    await requestOtp(PHONE, "SIGNUP", "unknown");
    expect(await requestOtp(PHONE, "SIGNUP", "unknown")).toEqual({ ok: true });
    expect(h.sms).toHaveLength(1);
  });

  it("caps codes per phone per hour", async () => {
    const cap = SETTING_DEFINITIONS["auth.otp.max_per_phone_per_hour"].default;
    for (let i = 0; i < cap; i++) {
      expect(await requestOtp(PHONE, "SIGNUP", "unknown")).toEqual({ ok: true });
      advance(61);
    }
    expect(await requestOtp(PHONE, "SIGNUP", "unknown")).toEqual({ ok: false, reason: "RATE_LIMITED" });
    advance(3600);
    expect(await requestOtp(PHONE, "SIGNUP", "unknown")).toEqual({ ok: true });
  });

  it("caps codes per IP per hour across different phones", async () => {
    const cap = SETTING_DEFINITIONS["auth.otp.max_per_ip_per_hour"].default;
    for (let i = 0; i < cap; i++) expect(await requestOtp(`+2010100${String(i).padStart(5, "0")}`, "SIGNUP", "7.7.7.7")).toEqual({ ok: true });
    expect(await requestOtp("+201019999999", "SIGNUP", "7.7.7.7")).toEqual({ ok: false, reason: "RATE_LIMITED" });
  });

  it("invalidates a code that could not be delivered", async () => {
    h.state.failSend = true;
    expect(await requestOtp(PHONE, "SIGNUP", "unknown")).toEqual({ ok: false, reason: "SEND_FAILED" });
    expect(fake.otpCode.rows[0]?.consumedAt).toBeInstanceOf(Date);
    expect(await verifyOtp(PHONE, "SIGNUP", "000000")).toBe(false);
  });
});

describe("phone verification", () => {
  it("activates the account, creates its star wallet, clears the nonce and writes an audit entry", async () => {
    const nonce = await registerOk();
    const result = await completePhoneVerification(PHONE, lastCode(), nonce, "unknown");
    expect(result).toMatchObject({ ok: true, user: { role: "CUSTOMER" } });
    expect(userRow()).toMatchObject({ status: "ACTIVE", signupNonceHash: null });
    expect(userRow()?.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(fake.starAccount.rows).toHaveLength(1);
    expect(auditActions()).toContain("USER_PHONE_VERIFIED");
  });

  it("gives merchants a wallet too, but would not for other roles", async () => {
    const nonce = await registerOk({ role: "MERCHANT" });
    await completePhoneVerification(PHONE, lastCode(), nonce, "unknown");
    expect(fake.starAccount.rows).toHaveLength(1);
  });

  it("rejects a wrong or expired code and a wrong nonce, leaving the account pending", async () => {
    const nonce = await registerOk();
    const code = lastCode();
    expect(await completePhoneVerification(PHONE, wrongCodeFor(code), nonce, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(await completePhoneVerification(PHONE, code, "x".repeat(43), "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(userRow()?.status).toBe("PENDING");
    advance(301);
    expect(await completePhoneVerification(PHONE, code, nonce, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(userRow()?.status).toBe("PENDING");
  });

  it("a request with the wrong nonce does not burn the real owner's code attempts", async () => {
    const nonce = await registerOk();
    const code = lastCode();
    for (let i = 0; i < 3; i++) await completePhoneVerification(PHONE, wrongCodeFor(code), "y".repeat(43), "unknown");
    expect(fake.otpCode.rows[0]?.attempts).toBe(0);
    expect((await completePhoneVerification(PHONE, code, nonce, "unknown")).ok).toBe(true);
  });

  it("stops after too many verification attempts per phone", async () => {
    const nonce = await registerOk();
    const limit = SETTING_DEFINITIONS["auth.login.max_per_phone_per_10min"].default;
    for (let i = 0; i < limit; i++) await completePhoneVerification(PHONE, "000000", nonce, "unknown");
    expect(await completePhoneVerification(PHONE, lastCode(), nonce, "unknown")).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("refuses a suspended account", async () => {
    const nonce = await registerOk();
    const code = lastCode();
    userRow()!.status = "SUSPENDED";
    expect(await completePhoneVerification(PHONE, code, nonce, "unknown")).toEqual({ ok: false, error: "SUSPENDED" });
  });

  it("a stray sign-up code can never log in an account that is already active", async () => {
    await createUser();
    await requestOtp(PHONE, "SIGNUP", "unknown"); // even if such a code existed...
    const result = await completePhoneVerification(PHONE, lastCode(), "z".repeat(43), "unknown");
    expect(result).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(auditActions()).not.toContain("USER_PHONE_VERIFIED");
  });
});

describe("pending sign-up hijack", () => {
  it("someone who only knows the phone number cannot take over an unverified account", async () => {
    const victimNonce = await registerOk({ name: "Victim", password: "victim password 1" });
    const victimCode = lastCode();

    // Attacker re-submits the form for the victim's number during the resend cooldown.
    const attackerNonce = await registerOk({ name: "Mallory", password: "attacker password 9" });
    expect(attackerNonce).not.toBe(victimNonce);

    // The victim's browser can no longer finish with the attacker's password in place...
    expect(await completePhoneVerification(PHONE, victimCode, victimNonce, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(userRow()?.status).toBe("PENDING");
    // ...and the attacker, who never saw the SMS, cannot finish either.
    expect(await completePhoneVerification(PHONE, wrongCodeFor(victimCode), attackerNonce, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(userRow()?.status).toBe("PENDING");

    // The victim recovers by submitting the form again with their own password.
    advance(61);
    const recoveryNonce = await registerOk({ name: "Victim", password: "victim password 1" });
    expect((await completePhoneVerification(PHONE, lastCode(), recoveryNonce, "unknown")).ok).toBe(true);
    expect((await authenticate({ phone: PHONE, password: "victim password 1" }, "unknown")).ok).toBe(true);
    expect(await authenticate({ phone: PHONE, password: "attacker password 9" }, "unknown")).toEqual({ ok: false, error: "INVALID" });
  });
});

describe("resending the sign-up code", () => {
  it("sends a fresh code only to the browser that holds the matching nonce", async () => {
    const nonce = await registerOk();
    advance(61);
    expect(await resendSignupCode(PHONE, nonce, "unknown")).toEqual({ ok: true });
    expect(h.sms).toHaveLength(2);
  });

  it("does nothing, and says nothing, for a wrong nonce, an active account or an unknown number", async () => {
    await registerOk();
    advance(61);
    expect(await resendSignupCode(PHONE, "w".repeat(43), "unknown")).toEqual({ ok: true });
    await createUser({ phone: "+201055555555" });
    expect(await resendSignupCode("+201055555555", "w".repeat(43), "unknown")).toEqual({ ok: true });
    expect(await resendSignupCode("+201066666666", "w".repeat(43), "unknown")).toEqual({ ok: true });
    expect(h.sms).toHaveLength(1);
  });
});

describe("login", () => {
  it("accepts the right password", async () => {
    await createUser();
    expect(await authenticate({ phone: PHONE, password: PASSWORD }, "unknown")).toMatchObject({ ok: true, user: { role: "CUSTOMER" } });
  });

  it("gives the same answer for a wrong password and an unknown phone", async () => {
    await createUser();
    const wrong = await authenticate({ phone: PHONE, password: "nope nope nope" }, "unknown");
    const unknown = await authenticate({ phone: "+201077777777", password: PASSWORD }, "unknown");
    expect(wrong).toEqual({ ok: false, error: "INVALID" });
    expect(unknown).toEqual(wrong);
  });

  it("locks the account after repeated failures, refuses even the right password, then unlocks", async () => {
    await createUser();
    const max = SETTING_DEFINITIONS["auth.login.max_failures"].default;
    for (let i = 0; i < max; i++) expect((await authenticate({ phone: PHONE, password: "bad password 1" }, "unknown")).ok).toBe(false);
    expect((userRow()?.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
    expect(auditActions()).toContain("ACCOUNT_LOCKED");
    expect(await authenticate({ phone: PHONE, password: PASSWORD }, "unknown")).toEqual({ ok: false, error: "INVALID" });

    advance(16 * 60);
    expect((await authenticate({ phone: PHONE, password: PASSWORD }, "unknown")).ok).toBe(true);
    expect(userRow()).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  });

  it("resets the failure counter after a successful login", async () => {
    await createUser();
    for (let i = 0; i < 3; i++) await authenticate({ phone: PHONE, password: "bad password 1" }, "unknown");
    expect(userRow()?.failedLoginCount).toBe(3);
    await authenticate({ phone: PHONE, password: PASSWORD }, "unknown");
    expect(userRow()?.failedLoginCount).toBe(0);
  });

  it("rate-limits attempts per phone and per IP", async () => {
    const perPhone = SETTING_DEFINITIONS["auth.login.max_per_phone_per_10min"].default;
    for (let i = 0; i < perPhone; i++) await authenticate({ phone: "+201088888881", password: "x y z 123" }, "unknown");
    expect(await authenticate({ phone: "+201088888881", password: "x y z 123" }, "unknown")).toEqual({ ok: false, error: "RATE_LIMITED" });

    const perIp = SETTING_DEFINITIONS["auth.login.max_per_ip_per_10min"].default;
    for (let i = 0; i < perIp; i++) await authenticate({ phone: `+2010200${String(i).padStart(5, "0")}`, password: "x y z 123" }, "6.6.6.6");
    expect(await authenticate({ phone: "+201029999999", password: "x y z 123" }, "6.6.6.6")).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("reports a suspended account only after the right password", async () => {
    await createUser({ status: "SUSPENDED" });
    expect(await authenticate({ phone: PHONE, password: PASSWORD }, "unknown")).toEqual({ ok: false, error: "SUSPENDED" });
    expect(await authenticate({ phone: PHONE, password: "wrong wrong 1" }, "unknown")).toEqual({ ok: false, error: "INVALID" });
  });

  it("sends an unverified account back to verification with a fresh nonce, and only for the right password", async () => {
    await createUser({ status: "PENDING", phoneVerifiedAt: null });
    expect(await authenticate({ phone: PHONE, password: "wrong wrong 1" }, "unknown")).toEqual({ ok: false, error: "INVALID" });
    expect(h.sms).toHaveLength(0);

    const result = await authenticate({ phone: PHONE, password: PASSWORD }, "unknown");
    if (result.ok || result.error !== "NEEDS_VERIFICATION") throw new Error("expected NEEDS_VERIFICATION");
    expect(h.sms).toHaveLength(1);
    expect((await completePhoneVerification(PHONE, lastCode(), result.nonce, "unknown")).ok).toBe(true);
    expect((await authenticate({ phone: PHONE, password: PASSWORD }, "unknown")).ok).toBe(true);
  });
});

describe("administrator login (password + authenticator code)", () => {
  const secret = generateTotpSecret();
  const currentCode = () => totpAt(secret, Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS));

  async function createAdmin() {
    return createUser({
      role: "ADMIN",
      totpSecretEnc: encryptSecret(parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY!), secret),
    });
  }

  it("requires a valid authenticator code and audits the login", async () => {
    await createAdmin();
    expect(await authenticate({ phone: PHONE, password: PASSWORD }, "unknown")).toEqual({ ok: false, error: "INVALID" });
    const wrong = currentCode() === "000000" ? "111111" : "000000";
    expect(await authenticate({ phone: PHONE, password: PASSWORD, totp: wrong }, "unknown")).toEqual({ ok: false, error: "INVALID" });
    expect(await authenticate({ phone: PHONE, password: PASSWORD, totp: currentCode() }, "unknown")).toMatchObject({ ok: true, user: { role: "ADMIN" } });
    expect(auditActions()).toContain("ADMIN_LOGIN");
  });

  it("refuses a code that was already used (replay)", async () => {
    await createAdmin();
    const code = currentCode();
    expect((await authenticate({ phone: PHONE, password: PASSWORD, totp: code }, "unknown")).ok).toBe(true);
    expect(await authenticate({ phone: PHONE, password: PASSWORD, totp: code }, "unknown")).toEqual({ ok: false, error: "INVALID" });
  });

  it("refuses an admin without a configured authenticator, whatever code is sent", async () => {
    await createUser({ role: "ADMIN" });
    expect(await authenticate({ phone: PHONE, password: PASSWORD, totp: "123456" }, "unknown")).toEqual({ ok: false, error: "INVALID" });
  });

  it("counts wrong authenticator codes toward the lockout", async () => {
    await createAdmin();
    const wrong = currentCode() === "000000" ? "111111" : "000000";
    for (let i = 0; i < SETTING_DEFINITIONS["auth.login.max_failures"].default; i++) {
      await authenticate({ phone: PHONE, password: PASSWORD, totp: wrong }, "unknown");
    }
    expect(auditActions()).toContain("ACCOUNT_LOCKED");
    expect(await authenticate({ phone: PHONE, password: PASSWORD, totp: currentCode() }, "unknown")).toEqual({ ok: false, error: "INVALID" });
  });
});

describe("sessions", () => {
  const cookieName = "saqr_session";
  const token = () => h.jar.get(cookieName)?.value ?? "";

  it("stores only a hash of the token and sets a hardened cookie", async () => {
    const user = await createUser();
    await createSession({ id: user.id, role: "CUSTOMER" }, "10.0.0.1");
    const row = fake.session.rows[0];
    expect(token().length).toBeGreaterThanOrEqual(40);
    expect(row?.tokenHash).not.toBe(token());
    expect(String(row?.tokenHash)).toMatch(/^[a-f0-9]{64}$/);
    expect(row).toMatchObject({ userId: user.id, ip: "10.0.0.1", userAgent: "vitest-agent" });
    expect(h.jar.get(cookieName)?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("uses __Host- and Secure cookies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const prod = await import("./session");
    await prod.createSession({ id: "u1", role: "CUSTOMER" }, "unknown");
    const names = [...h.jar.keys()];
    expect(names).toEqual(["__Host-saqr_session"]);
    expect(h.jar.get("__Host-saqr_session")?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("issues a brand-new token on every login (no session fixation) and keeps older sessions independent", async () => {
    const user = await createUser();
    await createSession({ id: user.id, role: "CUSTOMER" }, "unknown");
    const first = token();
    await createSession({ id: user.id, role: "CUSTOMER" }, "unknown");
    expect(token()).not.toBe(first);
    expect(fake.session.rows).toHaveLength(2);
  });

  it("gives administrators a shorter session than customers", async () => {
    const customer = await createUser();
    const admin = await createUser({ phone: "+201000000042", role: "ADMIN" });
    await createSession({ id: customer.id, role: "CUSTOMER" }, "unknown");
    await createSession({ id: admin.id, role: "ADMIN" }, "unknown");
    const byUser = (id: string) => (fake.session.rows.find((r) => r.userId === id)?.expiresAt as Date).getTime() - Date.now();
    expect(byUser(customer.id)).toBe(720 * 3_600_000);
    expect(byUser(admin.id)).toBe(12 * 3_600_000);
  });

  it("resolves the signed-in user with the admin's permissions", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await fake.grant(admin.id, "users.manage");
    await createSession({ id: admin.id, role: "ADMIN" }, "unknown");
    const current = await getCurrentSession();
    expect(current?.user).toMatchObject({ id: admin.id, role: "ADMIN", permissions: ["users.manage"], isSuperAdmin: false });
  });

  it("returns nothing without a cookie, with an unknown token or after expiry", async () => {
    expect(await getCurrentSession()).toBeNull();
    h.jar.set(cookieName, { value: "not-a-real-token", options: {} });
    expect(await getCurrentSession()).toBeNull();
    const user = await createUser();
    await createSession({ id: user.id, role: "CUSTOMER" }, "unknown");
    expect(await getCurrentSession()).not.toBeNull();
    advance(721 * 3600);
    expect(await getCurrentSession()).toBeNull();
  });

  it("stops working immediately for a suspended or unverified account, even with a valid cookie", async () => {
    const user = await createUser();
    await createSession({ id: user.id, role: "CUSTOMER" }, "unknown");
    userRow()!.status = "SUSPENDED";
    expect(await getCurrentSession()).toBeNull();
    userRow()!.status = "PENDING";
    expect(await getCurrentSession()).toBeNull();
    userRow()!.status = "ACTIVE";
    expect(await getCurrentSession()).not.toBeNull();
  });

  it("logout removes the server-side session and the cookie", async () => {
    const user = await createUser();
    await createSession({ id: user.id, role: "CUSTOMER" }, "unknown");
    await destroyCurrentSession();
    expect(fake.session.rows).toHaveLength(0);
    expect(h.jar.has(cookieName)).toBe(false);
    expect(await getCurrentSession()).toBeNull();
  });

  it("drops the user's own expired sessions when a new one is created", async () => {
    const user = await createUser();
    await fake.session.create({ data: { userId: user.id, tokenHash: "old", expiresAt: new Date(Date.now() - 1000) } });
    await createSession({ id: user.id, role: "CUSTOMER" }, "unknown");
    expect(fake.session.rows.map((r) => r.tokenHash)).not.toContain("old");
  });
});

describe("pending sign-up cookie", () => {
  it("round-trips the phone and nonce in a short-lived httpOnly cookie", async () => {
    await setPendingSignup(PHONE, "n".repeat(43));
    expect(await getPendingSignup()).toEqual({ phone: PHONE, nonce: "n".repeat(43) });
    expect(h.jar.get("saqr_pending")?.options).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 900 });
  });

  it("ignores malformed or tampered cookie values", async () => {
    for (const bad of ["garbage", `${PHONE}|short`, `${PHONE}|${"n".repeat(43)}|extra`, `0101234567|${"n".repeat(43)}`, `${PHONE}|${"n".repeat(43)}!`, ""]) {
      h.jar.set("saqr_pending", { value: bad, options: {} });
      expect(await getPendingSignup(), bad).toBeNull();
    }
    h.jar.delete("saqr_pending");
    expect(await getPendingSignup()).toBeNull();
  });
});

describe("suspending and reactivating accounts", () => {
  it("requires the users.manage permission and an ADMIN role", async () => {
    const target = await createUser();
    await expect(setUserStatus(adminActor({ permissions: [] }), target.id, "SUSPENDED", "abuse", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setUserStatus(adminActor({ role: "CUSTOMER" }), target.id, "SUSPENDED", "abuse", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
    expect(userRow()?.status).toBe("ACTIVE");
  });

  it("refuses self-changes, short reasons, unknown targets, the main admin and other admins (unless super admin)", async () => {
    const target = await createUser();
    await expect(setUserStatus(adminActor({ id: target.id }), target.id, "SUSPENDED", "abuse", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setUserStatus(adminActor(), target.id, "SUSPENDED", "  ", "unknown")).rejects.toThrow("reason");
    await expect(setUserStatus(adminActor(), "missing", "SUSPENDED", "abuse", "unknown")).rejects.toBeInstanceOf(NotFoundError);

    const main = await createUser({ phone: "+201000000001", role: "ADMIN", isSuperAdmin: true });
    await expect(setUserStatus(adminActor({ isSuperAdmin: true }), main.id, "SUSPENDED", "abuse", "unknown")).rejects.toBeInstanceOf(AuthorizationError);

    const other = await createUser({ phone: "+201000000002", role: "ADMIN" });
    await expect(setUserStatus(adminActor(), other.id, "SUSPENDED", "abuse", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
    await setUserStatus(adminActor({ isSuperAdmin: true }), other.id, "SUSPENDED", "left the team", "unknown");
    expect(fake.user.rows.find((r) => r.id === other.id)?.status).toBe("SUSPENDED");
  });

  it("suspension revokes every session at once and is audited with before/after and the reason", async () => {
    const target = await createUser();
    await createSession({ id: target.id, role: "CUSTOMER" }, "unknown");
    await createSession({ id: target.id, role: "CUSTOMER" }, "unknown");
    expect(fake.session.rows).toHaveLength(2);

    await setUserStatus(adminActor(), target.id, "SUSPENDED", "  fake receipts  ", "1.1.1.1");
    expect(userRow()?.status).toBe("SUSPENDED");
    expect(fake.session.rows).toHaveLength(0);
    expect(await getCurrentSession()).toBeNull();

    const entry = fake.auditLog.rows.find((r) => r.action === "USER_SUSPENDED");
    expect(entry).toMatchObject({ actorId: "admin-1", entityId: target.id, before: { status: "ACTIVE" }, after: { status: "SUSPENDED", reason: "fake receipts" }, ip: "1.1.1.1" });
    expect(await authenticate({ phone: PHONE, password: PASSWORD }, "unknown")).toEqual({ ok: false, error: "SUSPENDED" });
  });

  it("reactivates a verified account as ACTIVE and an unverified one as PENDING", async () => {
    const verified = await createUser({ status: "SUSPENDED" });
    await setUserStatus(adminActor(), verified.id, "ACTIVE", "appeal accepted", "unknown");
    expect(fake.user.rows.find((r) => r.id === verified.id)?.status).toBe("ACTIVE");

    const unverified = await createUser({ phone: "+201000000077", status: "SUSPENDED", phoneVerifiedAt: null });
    await setUserStatus(adminActor(), unverified.id, "ACTIVE", "appeal accepted", "unknown");
    expect(fake.user.rows.find((r) => r.id === unverified.id)?.status).toBe("PENDING");
    expect(auditActions().filter((a) => a === "USER_REACTIVATED")).toHaveLength(2);
  });
});
