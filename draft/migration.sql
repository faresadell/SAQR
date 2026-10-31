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

