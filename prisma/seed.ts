/**
 * Idempotent starting data: the agreed commission rates and the two payment methods.
 * Safe to run more than once. It never overwrites anything an admin already changed.
 * Contains no real accounts or payment details.
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { applySupportContact } from "../src/lib/legal/support-contact";
import { DEFAULT_PLANS } from "../src/lib/stars/rules";
import { DEFAULT_MEMBERSHIP_PLANS } from "../src/lib/memberships/rules";

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
  // Optional first-run setup: the receiving numbers come from the environment (never from the repository).
  // Only fills a method that has no number yet, and only then enables it; later edits by admins are never overwritten.
  const receivers = { vodafone_cash: process.env.VODAFONE_CASH_RECEIVER, instapay: process.env.INSTAPAY_RECEIVER } as const;
  for (const [code, raw] of Object.entries(receivers)) {
    const value = raw?.replace(/[\s-]/g, "");
    if (!value) continue;
    if (!/^[0-9+]{8,15}$/.test(value)) throw new Error(`${code} receiver number is not a valid phone number`);
    await db.paymentMethodConfig.updateMany({ where: { code, receiverNumber: null }, data: { receiverNumber: value, isEnabled: true } });
  }
  // Optional first-run setup: the official support contact comes from the environment (never from the repository).
  // Only fills the placeholder of a support page that is still an unapproved, untouched draft.
  const support = await db.legalPage.findUnique({ where: { slug: "support" } });
  if (support && support.approvedAt === null) {
    const filled = applySupportContact(support.body, { whatsapp: process.env.SUPPORT_WHATSAPP, email: process.env.SUPPORT_EMAIL });
    if (filled !== null) await db.legalPage.update({ where: { slug: "support" }, data: { body: filled } });
  }
  // Starting business kinds. Admins can add or hide kinds from the dashboard (nothing here is hardcoded in the app).
  const businessTypes = [
    { code: "restaurant", nameAr: "مطاعم", sortOrder: 1 },
    { code: "supermarket", nameAr: "سوبر ماركت", sortOrder: 2 },
    { code: "phones", nameAr: "تليفونات", sortOrder: 3 },
    { code: "pharmacy", nameAr: "صيدليات", sortOrder: 4 },
    { code: "bakery", nameAr: "مخابز وحلويات", sortOrder: 5 },
    { code: "greengrocer", nameAr: "خضار وفاكهة", sortOrder: 6 },
    { code: "clothes", nameAr: "ملابس", sortOrder: 7 },
    { code: "electronics", nameAr: "أجهزة وإلكترونيات", sortOrder: 8 },
    { code: "home", nameAr: "أدوات منزلية", sortOrder: 9 },
  ];
  for (const type of businessTypes) {
    await db.businessType.upsert({ where: { code: type.code }, update: {}, create: type });
  }
  // Star plans: created once from the agreed table; prices and stars are then edited by admins (never overwritten here).
  const audienceNames = { CUSTOMER: "عميل", DRIVER: "سائق", MERCHANT: "تاجر" } as const;
  for (const [index, plan] of DEFAULT_PLANS.entries()) {
    await db.plan.upsert({ where: { code: plan.code }, update: {}, create: { ...plan, nameAr: `${audienceNames[plan.audience]} ${plan.baseStars} نجمة`, sortOrder: index } });
  }
  // Merchant memberships (Plus / Premium): created once; prices are then edited by admins.
  for (const [index, plan] of DEFAULT_MEMBERSHIP_PLANS.entries()) {
    await db.membershipPlan.upsert({ where: { code: plan.code }, update: {}, create: { ...plan, sortOrder: index } });
  }
  console.log("Seed finished.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
