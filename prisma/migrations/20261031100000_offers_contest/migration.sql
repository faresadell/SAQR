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


-- ───────── Protections that Prisma cannot express (also kept in prisma/manual/007_offers_contest.sql) ─────────
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_dates_ordered" CHECK ("endsAt" > "startsAt");
ALTER TABLE "OfferExtension" ADD CONSTRAINT "OfferExtension_positive" CHECK ("hours" > 0 AND "starsCharged" >= 0);
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_rank_range" CHECK ("rank" BETWEEN 1 AND 3 AND "prizeCents" >= 0);
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_month_format" CHECK ("monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- One live award per rank and one rank per person each month (a rejected award frees both).
CREATE UNIQUE INDEX "ContestAward_month_rank_live" ON "ContestAward" ("monthKey", "rank") WHERE "status" <> 'REJECTED';
CREATE UNIQUE INDEX "ContestAward_month_userId_live" ON "ContestAward" ("monthKey", "userId") WHERE "status" <> 'REJECTED';

-- Extensions are an append-only record of paid time.
CREATE FUNCTION saqr_offer_extension_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'OfferExtension is append-only';
END $$;
CREATE TRIGGER offer_extension_append_only BEFORE UPDATE OR DELETE ON "OfferExtension"
  FOR EACH ROW EXECUTE FUNCTION saqr_offer_extension_guard();

-- Awards are never deleted; the facts of an award never change; PAID and REJECTED are final.
CREATE FUNCTION saqr_contest_award_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ContestAward cannot be deleted';
  END IF;
  IF OLD."status" IN ('PAID', 'REJECTED') THEN
    RAISE EXCEPTION 'ContestAward is final once % ', OLD."status";
  END IF;
  IF NEW."monthKey" <> OLD."monthKey" OR NEW."rank" <> OLD."rank" OR NEW."userId" <> OLD."userId"
     OR NEW."prizeCents" <> OLD."prizeCents" OR NEW."basisNote" <> OLD."basisNote" OR NEW."proposedById" <> OLD."proposedById" THEN
    RAISE EXCEPTION 'The facts of a ContestAward cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contest_award_guard BEFORE UPDATE OR DELETE ON "ContestAward"
  FOR EACH ROW EXECUTE FUNCTION saqr_contest_award_guard();
