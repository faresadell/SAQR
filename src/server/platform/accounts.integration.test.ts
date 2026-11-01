/**
 * Email codes, email password reset, administrator recovery codes and legal pages (real PostgreSQL).
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret, parseEncryptionKey } from "@/lib/auth/secret-box";
import { generateTotpSecret } from "@/lib/auth/totp";
import { authenticate } from "@/server/auth/auth-service";
import { countUnusedRecoveryCodes, generateRecoveryCodes } from "@/server/auth/admin-recovery";
import { confirmEmailVerification, confirmPasswordResetByEmail, requestPasswordResetByEmail, startEmailVerification } from "@/server/auth/email-account";
import { setEmailSenderForTests } from "@/server/auth/email-sender";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { approveLegalPage, getLegalPage, listLegalPages, updateLegalPage } from "@/server/legal/service";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const superAdmin: Actor = { id: "sa", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const limited: Actor = { id: "lim", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };
const sent: { to: string; purpose: string; code: string }[] = [];
let n = 0;

async function user(opts: { role?: "CUSTOMER" | "ADMIN"; email?: string; verifiedEmail?: boolean; password?: string } = {}) {
  n += 1;
  const phone = `+2011${String(n).padStart(8, "0")}`;
  const secretKey = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY!);
  const u = await db.user.create({
    data: {
      phone, name: `U${n}`, passwordHash: await hashPassword(opts.password ?? "Old-pass-12345"), role: opts.role ?? "CUSTOMER", status: "ACTIVE", phoneVerifiedAt: new Date(),
      email: opts.email, emailVerifiedAt: opts.email && opts.verifiedEmail !== false ? new Date() : null,
      ...(opts.role === "ADMIN" ? { totpSecretEnc: encryptSecret(secretKey, generateTotpSecret()) } : {}),
    },
  });
  return { u, phone, actor: { id: u.id, role: u.role, isSuperAdmin: false, permissions: [] } as Actor };
}

beforeEach(async () => {
  sent.length = 0;
  setEmailSenderForTests({ send: async (to, purpose, code) => void sent.push({ to, purpose, code }) });
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","User" RESTART IDENTITY CASCADE');
  await db.$executeRawUnsafe(`UPDATE "LegalPage" SET "version" = 1, "approvedAt" = NULL, "approvedById" = NULL`);
});
afterEach(() => setEmailSenderForTests(undefined));

describe("email verification", () => {
  it("emails a code, confirms once, stores the verified address", async () => {
    const a = await user();
    expect(await startEmailVerification(a.actor, "not-an-email", "unknown")).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await startEmailVerification(a.actor, "  A.User@Example.com ", "unknown")).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "a.user@example.com", purpose: "VERIFY_EMAIL" });
    expect(await startEmailVerification(a.actor, "a.user@example.com", "unknown")).toEqual({ ok: true });
    expect(sent).toHaveLength(1); // resend cooldown: nothing new is sent
    expect(await confirmEmailVerification(a.actor, "000000", "unknown")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect(await confirmEmailVerification(a.actor, sent[0]!.code, "unknown")).toEqual({ ok: true, email: "a.user@example.com" });
    expect(await confirmEmailVerification(a.actor, sent[0]!.code, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" }); // single use
    const row = await db.user.findUniqueOrThrow({ where: { id: a.u.id } });
    expect(row.email).toBe("a.user@example.com");
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(await startEmailVerification(a.actor, "a.user@example.com", "unknown")).toEqual({ ok: false, error: "ALREADY_VERIFIED" });
    expect(await db.auditLog.count({ where: { action: "EMAIL_VERIFIED", entityId: a.u.id } })).toBe(1);
  });

  it("does not reveal that an address belongs to someone else, and the second claimant cannot take it", async () => {
    const owner = await user({ email: "taken@example.com" });
    const other = await user();
    expect(await startEmailVerification(other.actor, "taken@example.com", "unknown")).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    // race: both ask for a free address, the first confirms, the second is refused
    const x = await user();
    const y = await user();
    await startEmailVerification(x.actor, "free@example.com", "unknown");
    await startEmailVerification(y.actor, "free@example.com", "unknown");
    expect(sent).toHaveLength(2);
    expect((await confirmEmailVerification(x.actor, sent[0]!.code, "unknown")).ok).toBe(true);
    expect(await confirmEmailVerification(y.actor, sent[1]!.code, "unknown")).toEqual({ ok: false, error: "EMAIL_TAKEN" });
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.u.id } })).email).toBe("taken@example.com");
  });

  it("limits wrong guesses and reports a provider failure without keeping a usable code", async () => {
    const a = await user();
    await startEmailVerification(a.actor, "g@example.com", "unknown");
    const good = sent[0]!.code;
    const wrong = good === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i += 1) await confirmEmailVerification(a.actor, wrong, "unknown");
    expect(await confirmEmailVerification(a.actor, good, "unknown")).toEqual({ ok: false, error: "INVALID_CODE" }); // attempts exhausted
    const b = await user();
    setEmailSenderForTests({ send: async () => { throw new Error("provider down"); } });
    expect(await startEmailVerification(b.actor, "b@example.com", "unknown")).toEqual({ ok: false, error: "SEND_FAILED" });
    expect(await db.emailCode.count({ where: { userId: b.u.id, consumedAt: null } })).toBe(0);
  });
});

describe("password reset by email", () => {
  it("is neutral for unknown, unverified and administrator addresses", async () => {
    await user({ email: "unv@example.com", verifiedEmail: false });
    await user({ role: "ADMIN", email: "adm@example.com" });
    for (const e of ["nobody@example.com", "unv@example.com", "adm@example.com"]) expect(await requestPasswordResetByEmail(e, "unknown")).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    expect(await requestPasswordResetByEmail("bad", "unknown")).toEqual({ ok: false, error: "INVALID_REQUEST" });
  });

  it("resets once with a valid code, signs out every device, and a weak password does not waste the code", async () => {
    const a = await user({ email: "r@example.com" });
    await db.session.create({ data: { userId: a.u.id, tokenHash: "h".repeat(64), expiresAt: new Date(Date.now() + 3_600_000) } });
    expect(await requestPasswordResetByEmail("R@example.com", "unknown")).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    const code = sent[0]!.code;
    expect(await confirmPasswordResetByEmail("r@example.com", "000000", "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect(await confirmPasswordResetByEmail("r@example.com", code, "12345678", "unknown")).toMatchObject({ ok: false, error: "WEAK_PASSWORD" });
    expect(await confirmPasswordResetByEmail("r@example.com", code, "New-pass-98765", "unknown")).toEqual({ ok: true });
    expect(await confirmPasswordResetByEmail("r@example.com", code, "Other-pass-5555", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
    expect(await db.session.count({ where: { userId: a.u.id } })).toBe(0);
    expect((await authenticate({ phone: a.phone, password: "New-pass-98765" }, "unknown")).ok).toBe(true);
    expect((await authenticate({ phone: a.phone, password: "Old-pass-12345" }, "unknown")).ok).toBe(false);
  });

  it("a verification code cannot be used to reset a password", async () => {
    const a = await user();
    await startEmailVerification(a.actor, "v@example.com", "unknown");
    const code = sent[0]!.code;
    await db.user.update({ where: { id: a.u.id }, data: { email: "v@example.com", emailVerifiedAt: new Date() } });
    expect(await confirmPasswordResetByEmail("v@example.com", code, "New-pass-98765", "unknown")).toMatchObject({ ok: false, error: "INVALID_CODE" });
  });
});

describe("administrator recovery codes", () => {
  it("are created by an admin with their password, work once at login instead of the authenticator code, and are replaced on regeneration", async () => {
    const adm = await user({ role: "ADMIN", password: "Admin-long-pass-123" });
    const customer = await user();
    await expect(generateRecoveryCodes(customer.actor, "Old-pass-12345", "unknown")).rejects.toBeInstanceOf(AuthorizationError);
    expect(await generateRecoveryCodes(adm.actor, "wrong password", "unknown")).toEqual({ ok: false, error: "WRONG_PASSWORD" });
    const first = await generateRecoveryCodes(adm.actor, "Admin-long-pass-123", "unknown");
    if (!first.ok) throw new Error("setup");
    expect(first.codes).toHaveLength(10);
    expect(await countUnusedRecoveryCodes(adm.actor)).toBe(10);
    const stored = await db.adminRecoveryCode.findMany({ where: { userId: adm.u.id } });
    expect(JSON.stringify(stored)).not.toContain(first.codes[0]!); // only hashes are stored

    expect((await authenticate({ phone: adm.phone, password: "Admin-long-pass-123" }, "unknown")).ok).toBe(false); // neither factor
    expect((await authenticate({ phone: adm.phone, password: "Admin-long-pass-123", recoveryCode: "AAAAA-AAAAA" }, "unknown")).ok).toBe(false);
    expect((await authenticate({ phone: adm.phone, password: "wrong", recoveryCode: first.codes[0]! }, "unknown")).ok).toBe(false); // password is still required
    const login = await authenticate({ phone: adm.phone, password: "Admin-long-pass-123", recoveryCode: first.codes[0]!.toLowerCase() }, "unknown");
    expect(login.ok).toBe(true);
    expect((await authenticate({ phone: adm.phone, password: "Admin-long-pass-123", recoveryCode: first.codes[0]! }, "unknown")).ok).toBe(false); // single use
    expect(await countUnusedRecoveryCodes(adm.actor)).toBe(9);
    expect(await db.auditLog.count({ where: { action: "ADMIN_RECOVERY_CODE_USED", entityId: adm.u.id } })).toBe(1);

    const second = await generateRecoveryCodes(adm.actor, "Admin-long-pass-123", "unknown");
    if (!second.ok) throw new Error("setup");
    expect((await authenticate({ phone: adm.phone, password: "Admin-long-pass-123", recoveryCode: first.codes[1]! }, "unknown")).ok).toBe(false); // replaced
    expect((await authenticate({ phone: adm.phone, password: "Admin-long-pass-123", recoveryCode: second.codes[1]! }, "unknown")).ok).toBe(true);
  });

  it("the database refuses to revive a used code", async () => {
    const adm = await user({ role: "ADMIN", password: "Admin-long-pass-123" });
    const r = await generateRecoveryCodes(adm.actor, "Admin-long-pass-123", "unknown");
    if (!r.ok) throw new Error("setup");
    await authenticate({ phone: adm.phone, password: "Admin-long-pass-123", recoveryCode: r.codes[0]! }, "unknown");
    await expect(db.$executeRawUnsafe(`UPDATE "AdminRecoveryCode" SET "usedAt" = NULL WHERE "userId" = '${adm.u.id}' AND "usedAt" IS NOT NULL`)).rejects.toThrow();
  });
});

describe("legal pages", () => {
  it("start as unapproved drafts; editing needs content.manage, is version-checked, and removes approval", async () => {
    const pages = await listLegalPages();
    expect(pages.map((p) => p.slug).sort()).toEqual(["cancellation", "contest", "privacy", "refund", "support", "terms"]);
    expect(pages.every((p) => !p.approved && p.body.includes("مسودة"))).toBe(true);
    await expect(getLegalPage("nope")).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateLegalPage(limited, "terms", { title: "t", body: "b", expectedVersion: 1 })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(approveLegalPage(limited, "terms", 1)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await updateLegalPage(superAdmin, "terms", { title: "الشروط", body: "نص جديد", expectedVersion: 1 })).toEqual({ ok: true, version: 2 });
    expect(await updateLegalPage(superAdmin, "terms", { title: "الشروط", body: "نص آخر", expectedVersion: 1 })).toEqual({ ok: false, error: "STALE_VERSION" });
    expect(await approveLegalPage(superAdmin, "terms", 1)).toEqual({ ok: false, error: "STALE_VERSION" });
    expect(await approveLegalPage(superAdmin, "terms", 2)).toEqual({ ok: true, version: 2 });
    expect(await getLegalPage("terms")).toMatchObject({ approved: true, version: 2, body: "نص جديد" });
    await updateLegalPage(superAdmin, "terms", { title: "الشروط", body: "تعديل بعد الاعتماد", expectedVersion: 2 });
    expect((await getLegalPage("terms")).approved).toBe(false);
    expect(await updateLegalPage(superAdmin, "terms", { title: "", body: "x", expectedVersion: 3 })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await updateLegalPage(superAdmin, "unknown", { title: "t", body: "b", expectedVersion: 1 })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await db.auditLog.count({ where: { entityType: "LegalPage", entityId: "terms" } })).toBe(3);
  });
});
