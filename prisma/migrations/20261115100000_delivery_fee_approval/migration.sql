-- CreateEnum
CREATE TYPE "DeliveryFeeStatus" AS ENUM ('NONE', 'PROPOSED', 'APPROVED');

-- AlterTable
ALTER TABLE "DeliveryRecord" ADD COLUMN "feeStatus" "DeliveryFeeStatus" NOT NULL DEFAULT 'APPROVED';
