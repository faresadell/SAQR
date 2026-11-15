import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export type AccountError = "INVALID_REQUEST" | "METHOD_NOT_AVAILABLE" | "TOO_MANY_ACCOUNTS";
export type AccountResult = { ok: true } | { ok: false; error: AccountError };

const MAX_ACCOUNTS = 20; // sanity bound; the owner asked for no business limit
const PHONE = /^01[0-25]\d{8}$/;
const HANDLE = /^[A-Za-z0-9@._+-]{3,60}$/;

/** The payment methods a shop can receive on: the ones the admin has switched on (the platform's own receiving number is not needed). */
export async function listAccountMethods() {
  return db.paymentMethodConfig.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" }, select: { code: true, nameAr: true } });
}

async function ownShop(actor: Actor) {
  if (actor.role !== "MERCHANT") throw new AuthorizationError();
  const shop = await db.merchant.findUnique({ where: { ownerId: actor.id }, select: { id: true } });
  if (!shop) throw new NotFoundError();
  return shop;
}

export function normalizeAccountValue(method: string, raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.replace(/[\s-]/g, "") : "";
  if (method === "vodafone_cash") return PHONE.test(value) ? value : null;
  return HANDLE.test(value) ? value : null;
}

export async function listMyAccounts(actor: Actor) {
  const shop = await ownShop(actor);
  return db.merchantPaymentAccount.findMany({ where: { merchantId: shop.id }, orderBy: { createdAt: "asc" }, select: { id: true, method: true, accountValue: true, holderName: true, isActive: true } });
}

export async function addAccount(actor: Actor, input: { method: string; accountValue: string; holderName?: string | null }): Promise<AccountResult> {
  const shop = await ownShop(actor);
  const method = String(input.method);
  const methods = await listAccountMethods();
  if (!methods.some((m) => m.code === method)) return { ok: false, error: "METHOD_NOT_AVAILABLE" };
  const accountValue = normalizeAccountValue(method, input.accountValue);
  const holder = typeof input.holderName === "string" ? input.holderName.trim() : "";
  if (!accountValue || (holder && (holder.length < 2 || holder.length > 60))) return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx): Promise<AccountResult> => {
    if ((await tx.merchantPaymentAccount.count({ where: { merchantId: shop.id } })) >= MAX_ACCOUNTS) return { ok: false, error: "TOO_MANY_ACCOUNTS" };
    const row = await tx.merchantPaymentAccount.create({ data: { merchantId: shop.id, method, accountValue, holderName: holder || null } });
    await writeAudit({ actorId: actor.id, action: "MERCHANT_ACCOUNT_ADDED", entityType: "MerchantPaymentAccount", entityId: row.id, after: { method } }, tx);
    return { ok: true };
  });
}

export async function setAccountActive(actor: Actor, accountId: string, isActive: boolean): Promise<AccountResult> {
  const shop = await ownShop(actor);
  const moved = await db.merchantPaymentAccount.updateMany({ where: { id: String(accountId), merchantId: shop.id }, data: { isActive } });
  if (moved.count !== 1) throw new NotFoundError();
  await writeAudit({ actorId: actor.id, action: isActive ? "MERCHANT_ACCOUNT_ENABLED" : "MERCHANT_ACCOUNT_DISABLED", entityType: "MerchantPaymentAccount", entityId: accountId });
  return { ok: true };
}

/** Payments keep their own snapshot of the number, so deleting an account never changes past orders. */
export async function removeAccount(actor: Actor, accountId: string): Promise<AccountResult> {
  const shop = await ownShop(actor);
  const gone = await db.merchantPaymentAccount.deleteMany({ where: { id: String(accountId), merchantId: shop.id } });
  if (gone.count !== 1) throw new NotFoundError();
  await writeAudit({ actorId: actor.id, action: "MERCHANT_ACCOUNT_REMOVED", entityType: "MerchantPaymentAccount", entityId: accountId });
  return { ok: true };
}

/** What a customer sees when paying this shop: only active accounts whose method is still switched on. */
export async function listShopAccountsForCustomer(merchantIds: string[]) {
  const [rows, methods] = await Promise.all([
    db.merchantPaymentAccount.findMany({ where: { merchantId: { in: merchantIds }, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, merchantId: true, method: true, accountValue: true, holderName: true } }),
    listAccountMethods(),
  ]);
  const label = new Map(methods.map((m) => [m.code, m.nameAr]));
  return rows.filter((r) => label.has(r.method)).map((r) => ({ ...r, methodLabel: label.get(r.method)! }));
}

export async function shopHasPaymentAccount(merchantId: string, client: Pick<typeof db, "merchantPaymentAccount"> = db): Promise<boolean> {
  return (await client.merchantPaymentAccount.count({ where: { merchantId, isActive: true } })) > 0;
}
