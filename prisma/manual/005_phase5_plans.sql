-- Plans: apply at the end of the generated migration. Run in CI after 004.
-- One pending purchase per user at a time (stops spam and double submission races).
CREATE UNIQUE INDEX plan_purchase_one_pending_per_user ON "PlanPurchase" ("userId") WHERE "status" = 'PENDING';
-- Only one approved purchase per transfer reference.
CREATE UNIQUE INDEX plan_purchase_approved_reference_unique ON "PlanPurchase" ("method", "referenceNo") WHERE "status" = 'APPROVED';
ALTER TABLE "Plan" ADD CONSTRAINT plan_values_sane CHECK ("priceCents" > 0 AND "baseStars" >= 0 AND "bonusStars" >= 0 AND ("offerQuota" IS NULL OR "offerQuota" >= 0));
ALTER TABLE "PlanPurchase" ADD CONSTRAINT plan_purchase_values_sane CHECK ("priceCentsSnap" > 0 AND "baseStarsSnap" >= 0 AND "bonusStarsSnap" >= 0);
