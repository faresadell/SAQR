ALTER TABLE "Order" ADD COLUMN "couponCode" TEXT, ADD COLUMN "couponFundedBy" TEXT;
ALTER TABLE "ParentOrder" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "merchantId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Coupon_value_check" CHECK ("value" > 0)
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_merchantId_createdAt_idx" ON "Coupon"("merchantId", "createdAt");
CREATE INDEX "Coupon_isActive_expiresAt_idx" ON "Coupon"("isActive", "expiresAt");

-- A coupon lowers what the customer pays for products; the parent total must follow (the Order constraint already allows a discount).
ALTER TABLE "ParentOrder" DROP CONSTRAINT parent_order_money_non_negative;
ALTER TABLE "ParentOrder" ADD CONSTRAINT parent_order_money_non_negative
  CHECK ("subtotalCents" >= 0 AND "deliveryFeeCents" >= 0 AND "discountCents" >= 0 AND "discountCents" <= "subtotalCents" AND "totalCents" = "subtotalCents" - "discountCents" + "deliveryFeeCents");
ALTER TABLE "Order" ADD CONSTRAINT order_discount_range CHECK ("discountCents" >= 0 AND "discountCents" <= "subtotalCents");
