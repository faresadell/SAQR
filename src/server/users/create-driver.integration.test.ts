/** An administrator opens driver accounts (real PostgreSQL). WARNING: it TRUNCATES tables. Use a throwaway database. */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate } from "@/server/auth/auth-service";
import type { SessionUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/errors";
import { createDriverByAdmin } from "@/server/users/create-driver";

process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "s".repeat(48);
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const input = { name: "سائق جديد", phone: "01011112222", email: "Driver@Example.com", password: "Sturdy-pass-91", vehicleType: "TUKTUK" };

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "RateLimitHit","Session","AuditLog","Driver","StarAccount","AdminPermission","User" RESTART IDENTITY CASCADE');
});

async function makeAdmin(superAdmin = true): Promise<SessionUser> {
  const user = await db.user.create({ data: { phone: "+201000000001", email: "admin@example.com", name: "Admin", passwordHash: "x", role: "ADMIN", status: "ACTIVE", isSuperAdmin: superAdmin } });
  return { user: { ...user, permissions: [] } } as unknown as SessionUser;
}

describe("admin opens a driver account", () => {
  it("creates an active driver who can sign in by email, with a Driver row and an audit entry", async () => {
    const admin = await makeAdmin();
    const r = await createDriverByAdmin(admin, input, "unknown");
    expect(r.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: "driver@example.com" } });
    expect(user).toMatchObject({ role: "DRIVER", status: "ACTIVE", phone: "+201011112222" });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.mustChangePassword).toBe(true); // temporary password: must be replaced at first sign-in
    expect(await db.driver.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({ vehicleType: "TUKTUK", isActive: true });
    expect(await db.auditLog.count({ where: { action: "DRIVER_CREATED_BY_ADMIN", entityId: user.id } })).toBe(1);
    expect((await authenticate({ email: "driver@example.com", password: input.password }, "unknown")).ok).toBe(true);
  });

  it("refuses a taken phone or email, a weak password and bad values", async () => {
    const admin = await makeAdmin();
    await createDriverByAdmin(admin, input, "unknown");
    expect(await createDriverByAdmin(admin, { ...input, email: "other@example.com" }, "unknown")).toEqual({ ok: false, error: "PHONE_TAKEN" });
    expect(await createDriverByAdmin(admin, { ...input, phone: "01099998888" }, "unknown")).toEqual({ ok: false, error: "EMAIL_TAKEN" });
    expect(await createDriverByAdmin(admin, { ...input, phone: "01033334444", email: "w@example.com", password: "12345678" }, "unknown")).toEqual({ ok: false, error: "WEAK_PASSWORD" });
    expect(await createDriverByAdmin(admin, { ...input, phone: "01077778888", email: "v@example.com", vehicleType: "BICYCLE" }, "unknown")).toEqual({ ok: false, error: "INVALID_VEHICLE" });
    expect(await createDriverByAdmin(admin, { ...input, phone: "123" }, "unknown")).toEqual({ ok: false, error: "INVALID_PHONE" });
    expect(await db.user.count({ where: { role: "DRIVER" } })).toBe(1);
  });

  it("is for administrators with the users.manage permission only", async () => {
    const plain = await makeAdmin(false);
    await expect(createDriverByAdmin(plain, input, "unknown")).rejects.toBeInstanceOf(AuthorizationError);
    const customer = { user: { id: "c", role: "CUSTOMER", isSuperAdmin: false, permissions: [] } } as unknown as SessionUser;
    await expect(createDriverByAdmin(customer, input, "unknown")).rejects.toBeInstanceOf(AuthorizationError);
  });
});
