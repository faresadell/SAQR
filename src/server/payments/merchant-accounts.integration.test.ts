import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { applyStarMove } from "@/server/stars/ledger";
import { invalidateSettingsCache } from "@/lib/settings";
import { NotFoundError } from "@/server/errors";
import { placeOrder } from "@/server/orders/checkout";
import { submitPayment } from "@/server/orders/lifecycle";
import { addAccount, listShopAccountsForCustomer, removeAccount, setAccountActive } from "@/server/payments/merchant-accounts";
import { grantPackage } from "@/test-support/package";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const past = new Date(Date.now() - 86_400_000);
let n = 0;

async function user(role: "CUSTOMER" | "MERCHANT"): Promise<Actor> {
  n += 1;
  const u = await db.user.create({ data: { phone: `+2012${String(n).padStart(8, "0")}`, name: `U${n}`, passwordHash: "x", role, status: "ACTIVE" } });
  return { id: u.id, role, isSuperAdmin: false, permissions: [] };
}

interface World { customer: Actor; owner: Actor; other: Actor; shopId: string; otherShopId: string; productId: string; addressId: string }
let w: World;

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "ParentOrder","Order","StarLedgerEntry","StarAccount","PlatformSettingVersion","CommissionRate","PaymentMethodConfig","DeliveryFeeVersion","DeliveryZone","BusinessType","Category","AuditLog","Notification","ReceiptUpload","User" RESTART IDENTITY CASCADE',
  );
  invalidateSettingsCache();
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
  const category = await db.category.create({ data: { nameAr: "عام" } });
  await db.commissionRate.createMany({ data: [{ tier: "REGULAR", basisPoints: 800, effectiveFrom: past, createdById: "t" }, { tier: "BUSINESS", basisPoints: 500, effectiveFrom: past, createdById: "t" }] });
  await db.paymentMethodConfig.createMany({ data: [{ code: "instapay", nameAr: "انستا باي", isEnabled: true }, { code: "vodafone_cash", nameAr: "فودافون كاش", isEnabled: true }] });
  await db.platformSettingVersion.create({ data: { key: "orders.merchant_response_minutes", value: { v: 30 }, effectiveFrom: past, createdById: "t" } });
  const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
  await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "t" } });
  const customer = await user("CUSTOMER");
  const owner = await user("MERCHANT");
  const other = await user("MERCHANT");
  const address = await db.address.create({ data: { userId: customer.id, line: "شارع 9", zoneId: zone.id } });
  for (const u of [customer, owner, other]) await db.$transaction((tx) => applyStarMove(tx, { userId: u.id, amount: 20, reason: "PURCHASE", idempotencyKey: `seed:${u.id}` }));
  await grantPackage(owner.id);
  await grantPackage(other.id);
  const shop = await db.merchant.create({ data: { ownerId: owner.id, name: "A", businessType: "restaurant", status: "APPROVED" } });
  const otherShop = await db.merchant.create({ data: { ownerId: other.id, name: "B", businessType: "restaurant", status: "APPROVED" } });
  const product = await db.product.create({ data: { merchantId: shop.id, categoryId: category.id, nameAr: "منتج", priceCents: 5000 } });
  w = { customer, owner, other, shopId: shop.id, otherShopId: otherShop.id, productId: product.id, addressId: address.id };
});

const order = () => placeOrder(w.customer, { idempotencyKey: "key-12345678", addressId: w.addressId, lines: [{ productId: w.productId, quantity: 1 }] });

describe("merchant payment accounts", () => {
  it("validates numbers per method and only offers methods the admin switched on", async () => {
    expect(await addAccount(w.owner, { method: "vodafone_cash", accountValue: "0101" })).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(await addAccount(w.owner, { method: "paypal", accountValue: "01012345678" })).toEqual({ ok: false, error: "METHOD_NOT_AVAILABLE" });
    expect(await addAccount(w.owner, { method: "vodafone_cash", accountValue: "010 1234-5678" })).toEqual({ ok: true });
    expect((await db.merchantPaymentAccount.findFirstOrThrow({ where: { merchantId: w.shopId } })).accountValue).toBe("01012345678");
  });

  it("a shop with no active account cannot take orders; adding one opens it", async () => {
    expect(await order()).toEqual(expect.objectContaining({ ok: false, error: "MERCHANT_UNAVAILABLE" }));
    expect(await addAccount(w.owner, { method: "instapay", accountValue: "shop@instapay" })).toEqual({ ok: true });
    const id = (await db.merchantPaymentAccount.findFirstOrThrow({ where: { merchantId: w.shopId } })).id;
    await setAccountActive(w.owner, id, false);
    expect(await order()).toEqual(expect.objectContaining({ ok: false }));
    await setAccountActive(w.owner, id, true);
    expect((await order()).ok).toBe(true);
  });

  it("the customer pays the shop's own account, the receiver is snapshotted, and another shop's account is refused", async () => {
    await addAccount(w.owner, { method: "instapay", accountValue: "shop@instapay" });
    await addAccount(w.other, { method: "instapay", accountValue: "other@instapay" });
    const mine = await db.merchantPaymentAccount.findFirstOrThrow({ where: { merchantId: w.shopId } });
    const theirs = await db.merchantPaymentAccount.findFirstOrThrow({ where: { merchantId: w.otherShopId } });
    const r = await order();
    if (!r.ok) throw new Error("setup");
    const id = r.suborderIds[0]!;
    const up = (sha: string) => db.receiptUpload.create({ data: { orderId: id, uploaderId: w.customer.id, storageKey: `receipts/${id}/${sha}.jpg`, contentType: "image/jpeg", sizeBytes: 10, sha256: sha } });
    expect(await submitPayment(w.customer, id, { accountId: theirs.id, referenceNo: "REF-1001", uploadId: (await up("s1")).id })).toEqual({ ok: false, error: "PAYMENT_RECEIVER_NOT_SET" });
    expect((await submitPayment(w.customer, id, { accountId: mine.id, referenceNo: "REF-1002", uploadId: (await up("s2")).id })).ok).toBe(true);
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: id } });
    expect(pay).toEqual(expect.objectContaining({ method: "instapay", accountId: mine.id, receiverValue: "shop@instapay" }));
    await removeAccount(w.owner, mine.id);
    expect((await db.payment.findFirstOrThrow({ where: { orderId: id } })).receiverValue).toBe("shop@instapay"); // history survives deleting the account
  });

  it("only the owner manages an account, and customers see active accounts of enabled methods only", async () => {
    await addAccount(w.owner, { method: "instapay", accountValue: "shop@instapay" });
    await addAccount(w.owner, { method: "vodafone_cash", accountValue: "01012345678" });
    const mine = await db.merchantPaymentAccount.findMany({ where: { merchantId: w.shopId } });
    await expect(removeAccount(w.other, mine[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setAccountActive(w.other, mine[0]!.id, false)).rejects.toBeInstanceOf(NotFoundError);
    await db.paymentMethodConfig.update({ where: { code: "vodafone_cash" }, data: { isEnabled: false } });
    expect((await listShopAccountsForCustomer([w.shopId])).map((a) => a.method)).toEqual(["instapay"]);
  });
});
