-- Owner-approved offer quota per merchant package (14 Nov 2026): 100+15 -> 4 offers, 150+25 -> 6, 200+35 -> 8 per 30-day cycle.
-- Only fills quotas that were never set, so an admin's own edit is never overwritten.
UPDATE "Plan" SET "offerQuota" = 4, "updatedAt" = now() WHERE "code" = 'merchant_stars_100' AND "offerQuota" IS NULL;
UPDATE "Plan" SET "offerQuota" = 6, "updatedAt" = now() WHERE "code" = 'merchant_stars_150' AND "offerQuota" IS NULL;
UPDATE "Plan" SET "offerQuota" = 8, "updatedAt" = now() WHERE "code" = 'merchant_stars_200' AND "offerQuota" IS NULL;
