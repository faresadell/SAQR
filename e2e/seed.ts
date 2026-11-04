/**
 * Test data for the browser tests (run only in CI against a throwaway database):  tsx e2e/seed.ts
 * One admin (with a known authenticator secret), one approved shop with products, and one shop-less merchant account
 * per browser project, so the desktop and mobile runs never share an account (authenticator codes cannot be reused).
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { encryptSecret, parseEncryptionKey } from "../src/lib/auth/secret-box";
import { E2E_ACCOUNTS, E2E_ADMIN_PW, E2E_PROJECTS, E2E_TOTP_SECRET, type E2eProject } from "./accounts";

async function seedProject(db: PrismaClient, project: E2eProject, categoryId: string, key: Buffer, passwordHash: string): Promise<void> {
  const a = E2E_ACCOUNTS[project];
  const base = { status: "ACTIVE" as const, passwordHash };
  await db.user.create({ data: { ...base, phone: a.adminPhone, name: `مدير ${project}`, role: "ADMIN", isSuperAdmin: true, phoneVerifiedAt: new Date(), totpSecretEnc: encryptSecret(key, E2E_TOTP_SECRET) } });
  await db.user.create({ data: { ...base, phone: a.ownerPhone, name: `صاحب ${project}`, role: "MERCHANT" } });
  const seeded = await db.user.create({ data: { ...base, phone: a.seededShopPhone, name: `تاجر ${project}`, role: "MERCHANT" } });
  const shop = await db.merchant.create({ data: { ownerId: seeded.id, name: a.seededShopName, businessType: "restaurant", status: "APPROVED", description: "مشويات وأكل بيتي", address: "المعادي" } });
  await db.product.createMany({
    data: [
      { merchantId: shop.id, categoryId, nameAr: "كباب", priceCents: 12000 },
      { merchantId: shop.id, categoryId, nameAr: "كفتة", priceCents: 9000 },
    ],
  });
}

/** What an administrator sets up before launch: a delivery zone with its fee, the merchant response window, and where payments are received. */
async function seedPlatform(db: PrismaClient): Promise<void> {
  const past = new Date(Date.now() - 86_400_000);
  const zone = await db.deliveryZone.create({ data: { name: "المعادي" } });
  await db.deliveryFeeVersion.create({ data: { zoneId: zone.id, feeCents: 2000, effectiveFrom: past, createdById: "e2e" } });
  await db.platformSettingVersion.create({ data: { key: "orders.merchant_response_minutes", value: { v: 30 }, effectiveFrom: past, createdById: "e2e" } });
  await db.paymentMethodConfig.updateMany({ data: { isEnabled: true, receiverNumber: "01000000999" } });
}

async function main(): Promise<void> {
  const db = new PrismaClient();
  try {
    if (!E2E_ADMIN_PW || E2E_TOTP_SECRET.length < 16) throw new Error("E2E_ADMIN_PW and E2E_TOTP_SECRET must be set");
    const key = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY ?? "");
    const passwordHash = await hashPassword(E2E_ADMIN_PW);
    await seedPlatform(db);
    const category = await db.category.create({ data: { nameAr: "مشويات" } });
    await Promise.all(E2E_PROJECTS.map((project) => seedProject(db, project, category.id, key, passwordHash)));
    console.log("e2e seed done");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
