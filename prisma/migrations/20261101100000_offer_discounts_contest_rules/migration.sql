-- CreateEnum
CREATE TYPE "OfferDiscountType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "discountType" "OfferDiscountType",
ADD COLUMN     "discountValue" INTEGER;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "offerId" TEXT,
ADD COLUMN     "unitDiscountCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OfferProduct" (
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "OfferProduct_pkey" PRIMARY KEY ("offerId","productId")
);

-- CreateTable
CREATE TABLE "ContestExclusion" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "excludedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferProduct_productId_idx" ON "OfferProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestExclusion_monthKey_userId_key" ON "ContestExclusion"("monthKey", "userId");

-- AddForeignKey
ALTER TABLE "OfferProduct" ADD CONSTRAINT "OfferProduct_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferProduct" ADD CONSTRAINT "OfferProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Manual protections (see prisma/manual/010_offer_discounts_contest_rules.sql)
-- Protections Prisma cannot express (also appended to migration 20261101100000_offer_discounts_contest_rules).
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_discount_check"
  CHECK (("discountType" IS NULL) = ("discountValue" IS NULL)
     AND ("discountValue" IS NULL OR "discountValue" > 0)
     AND ("discountType" IS DISTINCT FROM 'PERCENT' OR "discountValue" <= 9000));

-- A discounted line can never be free or negative, and the stored numbers must add up.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_discount_check"
  CHECK ("unitDiscountCents" >= 0
     AND ("unitDiscountCents" = 0 OR "unitDiscountCents" < "unitPriceCents")
     AND "discountCents" = "unitDiscountCents" * "quantity"
     AND "lineTotalCents" = ("unitPriceCents" - "unitDiscountCents") * "quantity");

ALTER TABLE "ContestExclusion" ADD CONSTRAINT "ContestExclusion_reason_check" CHECK (length("reason") BETWEEN 3 AND 300 AND "monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- The contest rules page joins the editable legal pages. It is a DRAFT until an administrator approves it.
ALTER TABLE "LegalPage" DROP CONSTRAINT "LegalPage_slug_check";
ALTER TABLE "LegalPage" ADD CONSTRAINT "LegalPage_slug_check" CHECK ("slug" IN ('terms','privacy','cancellation','refund','support','contest'));
INSERT INTO "LegalPage" ("slug","title","body","updatedAt") VALUES
('contest','قواعد المسابقة الشهرية (مسودة)','مسودة غير معتمدة قانونيًا — لا تبدأ المسابقة قبل اعتماد هذه الصفحة وتفعيلها من الإعدادات.

الجوائز: 1000 جنيه للمركز الأول، 500 للثاني، 250 للثالث.

الترتيب:
1. الأكثر في عدد الطلبات المكتملة المؤهلة خلال الشهر (بتوقيت القاهرة).
2. عند التعادل: الأعلى في قيمة المبيعات المؤهلة (قيمة المنتجات بعد الخصم وبعد أي استرداد جزئي).
3. عند استمرار التعادل: الأسبق في الوصول إلى النتيجة.

لا يُحتسب: الطلبات الملغاة أو المستردة بالكامل، الطلب من متجرك أنت، الطلب الذي قيمته أقل من الحد الأدنى المعلن، وأي طلب يتكرر احتسابه. ويُطبّق حد أقصى لعدد الطلبات من نفس المتجر إن أعلنته الإدارة.

للإدارة استبعاد أي مشارك ثبت تلاعبه مع تسجيل السبب. تُراجع النتائج وتُعتمد من الإدارة قبل صرف أي جائزة.

[تُستكمل البنود النهائية بعد المراجعة القانونية]',now())
ON CONFLICT ("slug") DO NOTHING;
