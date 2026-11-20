-- Email delivery of important notifications, delivery timeouts, and driver availability that expires.
ALTER TABLE "Notification" ADD COLUMN "emailedAt" TIMESTAMP(3), ADD COLUMN "emailTries" INTEGER NOT NULL DEFAULT 0;
-- Nothing that already exists is emailed retroactively.
UPDATE "Notification" SET "emailedAt" = CURRENT_TIMESTAMP WHERE "emailedAt" IS NULL;
CREATE INDEX "Notification_emailedAt_createdAt_idx" ON "Notification"("emailedAt", "createdAt");
ALTER TABLE "DeliveryRecord" ADD COLUMN "feeProposedAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
