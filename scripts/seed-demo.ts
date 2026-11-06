/**
 * Demo accounts for trying the site as a customer, a shop and a driver. Runs on a Vercel production build ONLY when
 * PREVIEW_MODE=true and DEMO_PASSWORD is set (a password you choose in Vercel; it is never written in the repository).
 * Safe to run again: accounts are matched by phone and their password is refreshed. Remove DEMO_PASSWORD to stop it.
 */
import { PrismaClient } from "@prisma/client";
import { checkPasswordStrength, hashPassword } from "../src/lib/auth/password";

const PHONES = { customer: "+201000000101", merchant: "+201000000102", driver: "+201000000103" } as const;

async function main(): Promise<void> {
  const password = process.env.DEMO_PASSWORD ?? "";
  if (process.env.PREVIEW_MODE !== "true") throw new Error("Demo accounts are only for PREVIEW_MODE=true deployments");
  const problem = checkPasswordStrength(password, PHONES.customer);
  if (problem || password.length < 10) throw new Error(`DEMO_PASSWORD rejected (${problem ?? "use at least 10 characters"})`);

  const db = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const past = new Date(Date.now() - 86_400_000);
    const upsertUser = (phone: string, name: string, role: "CUSTOMER" | "MERCHANT" | "DRIVER") =>
      db.user.upsert({
        where: { phone },
        create: { phone, name, role, status: "ACTIVE", passwordHash, phoneVerifiedAt: new Date() },
        update: { passwordHash, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
      });
    const customer = await upsertUser(PHONES.customer, "عميل تجريبي", "CUSTOMER");
    const merchantUser = await upsertUser(PHONES.merchant, "تاجر تجريبي", "MERCHANT");
    const driverUser = await upsertUser(PHONES.driver, "سائق تجريبي", "DRIVER");

    // A delivery zone and the merchant response window, only when the admin has not set any yet.
    let zone = await db.deliveryZone.findFirst();
    if (!zone) {
      zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
      await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "demo" } });
    }
    if (!(await db.platformSettingVersion.findFirst({ where: { key: "orders.merchant_response_minutes" } }))) {
      await db.platformSettingVersion.create({ data: { key: "orders.merchant_response_minutes", value: { v: 30 }, effectiveFrom: past, createdById: "demo" } });
    }

    // The customer: two stars to start an order, and one address.
    const account = await db.starAccount.upsert({ where: { userId: customer.id }, create: { userId: customer.id, balance: 0 }, update: {} });
    const granted = await db.starLedgerEntry.findUnique({ where: { idempotencyKey: `demo-stars-${customer.id}` } });
    if (!granted) {
      const balance = account.balance + 5;
      await db.$transaction([
        db.starLedgerEntry.create({ data: { accountId: account.id, amount: 5, balanceAfter: balance, reason: "ADMIN_CORRECTION", note: "demo account", idempotencyKey: `demo-stars-${customer.id}` } }),
        db.starAccount.update({ where: { id: account.id }, data: { balance } }),
      ]);
    }
    if (!(await db.address.findFirst({ where: { userId: customer.id } }))) {
      await db.address.create({ data: { userId: customer.id, label: "البيت", line: "١٢ شارع التحرير، المعادي", zoneId: zone.id } });
    }

    // The shop: approved, with a few products.
    let shop = await db.merchant.findFirst({ where: { ownerId: merchantUser.id } });
    if (!shop) {
      shop = await db.merchant.create({ data: { ownerId: merchantUser.id, name: "مطعم صقر التجريبي", businessType: "restaurant", status: "APPROVED", description: "مشويات وأكل بيتي (حساب تجريبي)", address: "المعادي" } });
      const category = (await db.category.findFirst({ where: { nameAr: "مشويات" } })) ?? (await db.category.create({ data: { nameAr: "مشويات" } }));
      await db.product.createMany({
        data: [
          { merchantId: shop.id, categoryId: category.id, nameAr: "كباب", priceCents: 12000 },
          { merchantId: shop.id, categoryId: category.id, nameAr: "كفتة", priceCents: 9000 },
          { merchantId: shop.id, categoryId: category.id, nameAr: "ستيك دجاج", priceCents: 8000 },
        ],
      });
    }

    // The driver: independent, takes orders from the open board.
    await db.driver.upsert({ where: { userId: driverUser.id }, create: { userId: driverUser.id, isActive: true }, update: { isActive: true } });
    console.log("demo accounts ready");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
