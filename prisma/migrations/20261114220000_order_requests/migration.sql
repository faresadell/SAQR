-- CreateEnum
CREATE TYPE "OrderRequestStatus" AS ENUM ('PENDING_QUOTE', 'QUOTED', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OrderRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "OrderRequestStatus" NOT NULL DEFAULT 'PENDING_QUOTE',
    "quotedSubtotalCents" INTEGER,
    "quoteNote" TEXT,
    "quotedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "parentOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderRequest_customerId_createdAt_idx" ON "OrderRequest"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderRequest_merchantId_status_createdAt_idx" ON "OrderRequest"("merchantId", "status", "createdAt");
