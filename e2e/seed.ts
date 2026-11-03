/**
 * Test data for the browser tests (run only in CI against a throwaway database):  npx tsx e2e/seed.ts
 * One admin (with a known authenticator secret), one approved shop with products, and one shop-less merchant account
 * per browser project, so the desktop and mobile runs never share an account (authenticator codes cannot be reused).
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { encryptSecret, parseEncryptionKey } from "../src/lib/auth/secret-box";
import { E2E_ADMIN_PASSWORD, E2E_ACCOUNTS, E2E_TOTP_SECRET, E2E_PROJECTS } from "./accounts";

async function main() {
  const db = new PrismaClient();
  try {
    const key = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY ?? "");
    const passwordHash = await hashPassword(E2E_ADMIN_PASSWORD);
    const category = await db.category.create({ data: { nameAr: "مشويات" } });
    for (const project of E2E_PROJECTS) {
      const a = E2E_ACCOUNTS[project];
      await db.user.create({ data: { phone: a.adminPhone, name: `مدير ${project}`, role: "ADMIN", status: "ACTIVE", isSuperAdmin: true, phoneVerifiedAt: new Date(), passwordHash, totpSecretEnc: encryptSecret(key, E2E_TOTP_SECRET) } });
      await db.user.create({ data: { phone: a.ownerPhone, name: `صاحب ${project}`, role: "MERCHANT", status: "ACTIVE", passwordHash } });
      const seeded = await db.user.create({ data: { phone: a.seededShopPhone, name: `تاجر ${project}`, role: "MERCHANT", status: "ACTIVE", passwordHash } });
      const shop = await db.merchant.create({ data: { ownerId: seeded.id, name: a.seededShopName, businessType: "restaurant", status: "APPROVED", description: "مشويات وأكل بيتي", address: "المعادي" } });
      await db.product.create({ data: { merchantId: shop.id, categoryId: category.id, nameAr: "كباب", priceCents: 12000 } });
      await db.product.create({ data: { merchantId: shop.id, categoryId: category.id, nameAr: "كفتة", priceCents: 9000 } });
    }
    console.log("e2e seed done");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
