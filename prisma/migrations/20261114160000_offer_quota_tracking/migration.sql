-- Offer quota per package cycle: free offers are counted (even after they end or are stopped); offers outside the quota are paid per hour.
ALTER TABLE "Offer" ADD COLUMN "quotaUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN "paidHours" INTEGER;
