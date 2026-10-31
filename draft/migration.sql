-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'STOPPED');

-- CreateEnum
CREATE TYPE "ContestAwardStatus" AS ENUM ('PROPOSED', 'APPROVED', 'PAID', 'REJECTED');

-- AlterEnum
ALTER TYPE "StarReason" ADD VALUE 'OFFER_EXTENSION';

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "stoppedAt" TIMESTAMP(3),
    "stoppedById" TEXT,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferExtension" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "starsCharged" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestAward" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "prizeCents" INTEGER NOT NULL,
    "basisNote" TEXT NOT NULL,
    "status" "ContestAwardStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_merchantId_status_endsAt_idx" ON "Offer"("merchantId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "Offer_status_endsAt_idx" ON "Offer"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferExtension_offerId_idempotencyKey_key" ON "OfferExtension"("offerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ContestAward_monthKey_status_idx" ON "ContestAward"("monthKey", "status");

-- CreateIndex
CREATE INDEX "ContestAward_userId_idx" ON "ContestAward"("userId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferExtension" ADD CONSTRAINT "OfferExtension_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

