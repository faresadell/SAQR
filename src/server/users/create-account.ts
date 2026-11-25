import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/email";
import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { validateMerchantInput } from "@/lib/catalog/merchant-input";
import { AuthorizationError } from "@/server/errors";
import { cleanDisplayName } from "@/server/auth/change-name";
import type { SessionUser } from "@/server/auth/session";

export type CreateAccountError = "INVALID_NAME" | "INVALID_PHONE" | "INVALID_EMAIL" | "WEAK_PASSWORD" | "PHONE_TAKEN" | "EMAIL_TAKEN" | "INVALID_SHOP" | "INVALID_BUSINESS_TYPE";
export type CreateAccountResult = { ok: true; userId: string } | { ok: false; error: CreateAccountError };

interface BaseInput {
  name: string;
  phone: string;
  email: string;
  password: string;
}

async function validateBase(input: BaseInput) {
  const name = cleanDisplayName(input.name);
  if (!name) return { error: "INVALID_NAME" as const };
  const phone = normalizeEgyptPhone(input.phone);
  if (!phone) return { error: "INVALID_PHONE" as const };
  const email = normalizeEmail(input.email);
  if (!email) return { error: "INVALID_EMAIL" as const };
  if (checkPasswordStrength(input.password, phone)) return { error: "WEAK_PASSWORD" as const };
  const [byPhone, byEmail] = await Promise.all([db.user.findUnique({ where: { phone }, select: { id: true } }), db.user.findUnique({ where: { email }, select: { id: true } })]);
  if (byPhone) return { error: "PHONE_TAKEN" as const };
  if (byEmail) return { error: "EMAIL_TAKEN" as const };
  return { value: { name, phone, email, passwordHash: await hashPassword(input.password) } };
}

/**
 * An administrator opens a merchant account together with its (approved) shop. The account is active at once and the owner signs in
 * with the email and the temporary password. The shop still needs a package and a payment account before it can take orders.
 */
export async function createMerchantByAdmin(actor: SessionUser, input: BaseInput & { shopName: string; businessType: string }, ip: string): Promise<CreateAccountResult> {
  if (!hasPermission(actor.user, "users.manage")) throw new AuthorizationError();
  const shop = validateMerchantInput({ name: input.shopName, businessType: input.businessType });
  if (!shop.ok) return { ok: false, error: shop.errors.businessType ? "INVALID_BUSINESS_TYPE" : "INVALID_SHOP" };
  const base = await validateBase(input);
  if ("error" in base) return { ok: false, error: base.error };
  try {
    return await db.$transaction(async (tx): Promise<CreateAccountResult> => {
      const type = await tx.businessType.findUnique({ where: { code: shop.value.businessType } });
      if (!type?.isActive) return { ok: false, error: "INVALID_BUSINESS_TYPE" };
      const now = new Date();
      const user = await tx.user.create({ data: { ...base.value, role: "MERCHANT", status: "ACTIVE", emailVerifiedAt: now } });
      const merchant = await tx.merchant.create({ data: { ownerId: user.id, name: shop.value.name, businessType: shop.value.businessType, status: "APPROVED", reviewedById: actor.user.id, reviewedAt: now } });
      await tx.starAccount.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
      await writeAudit({ actorId: actor.user.id, action: "MERCHANT_ACCOUNT_CREATED_BY_ADMIN", entityType: "User", entityId: user.id, after: { role: "MERCHANT", merchantId: merchant.id, shop: shop.value.name }, ip }, tx);
      return { ok: true, userId: user.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "PHONE_TAKEN" };
    throw error;
  }
}

/** An administrator opens a customer account (active at once, email counted as verified). */
export async function createCustomerByAdmin(actor: SessionUser, input: BaseInput, ip: string): Promise<CreateAccountResult> {
  if (!hasPermission(actor.user, "users.manage")) throw new AuthorizationError();
  const base = await validateBase(input);
  if ("error" in base) return { ok: false, error: base.error };
  try {
    return await db.$transaction(async (tx): Promise<CreateAccountResult> => {
      const user = await tx.user.create({ data: { ...base.value, role: "CUSTOMER", status: "ACTIVE", emailVerifiedAt: new Date() } });
      await tx.starAccount.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
      await writeAudit({ actorId: actor.user.id, action: "CUSTOMER_CREATED_BY_ADMIN", entityType: "User", entityId: user.id, after: { role: "CUSTOMER" }, ip }, tx);
      return { ok: true, userId: user.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "PHONE_TAKEN" };
    throw error;
  }
}
