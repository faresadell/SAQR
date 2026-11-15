-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "receiverValue" TEXT;

-- CreateTable
CREATE TABLE "MerchantPaymentAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "accountValue" TEXT NOT NULL,
    "holderName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantPaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantPaymentAccount_merchantId_isActive_idx" ON "MerchantPaymentAccount"("merchantId", "isActive");

-- AddForeignKey
ALTER TABLE "MerchantPaymentAccount" ADD CONSTRAINT "MerchantPaymentAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
