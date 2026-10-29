/**
 * Idempotent starting data: the agreed commission rates and the two payment methods.
 * Safe to run more than once. It never overwrites anything an admin already changed.
 * Contains no real accounts or payment details.
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const SYSTEM = "system-seed";
const FROM_THE_START = new Date("2000-01-01T00:00:00.000Z");

async function main() {
  const rates = [
    { tier: "REGULAR" as const, basisPoints: 800 }, // Basic: 8%
    { tier: "BUSINESS" as const, basisPoints: 500 }, // Premium: 5%
  ];
  for (const rate of rates) {
    const exists = await db.commissionRate.findFirst({ where: { tier: rate.tier } });
    if (!exists) await db.commissionRate.create({ data: { ...rate, effectiveFrom: FROM_THE_START, createdById: SYSTEM } });
  }

  const methods = [
    { code: "vodafone_cash", nameAr: "فودافون كاش", sortOrder: 1 },
    { code: "instapay", nameAr: "إنستاباي", sortOrder: 2 },
  ];
  for (const method of methods) {
    // Disabled until an admin enables them from the dashboard.
    await db.paymentMethodConfig.upsert({ where: { code: method.code }, update: {}, create: { ...method, isEnabled: false } });
  }
  // Starting business kinds. Admins can add or hide kinds from the dashboard (nothing here is hardcoded in the app).
  const businessTypes = [
    { code: "restaurant", nameAr: "مطعم", sortOrder: 1 },
    { code: "shop", nameAr: "متجر", sortOrder: 2 },
  ];
  for (const type of businessTypes) {
    await db.businessType.upsert({ where: { code: type.code }, update: {}, create: type });
  }
  console.log("Seed finished.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
