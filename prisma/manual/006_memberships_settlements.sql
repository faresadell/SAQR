-- Merchant memberships and commission settlements. Apply after 005.

-- One pending membership purchase per shop at a time; one approved purchase per transfer reference.
CREATE UNIQUE INDEX membership_purchase_one_pending_per_shop ON "MembershipPurchase" ("merchantId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX membership_purchase_approved_reference_unique ON "MembershipPurchase" ("method", "referenceNo") WHERE "status" = 'APPROVED';
ALTER TABLE "MembershipPlan" ADD CONSTRAINT membership_plan_values_sane CHECK ("priceCents" > 0 AND "durationDays" BETWEEN 1 AND 366);
ALTER TABLE "MembershipPurchase" ADD CONSTRAINT membership_purchase_values_sane CHECK ("priceCentsSnap" > 0 AND "durationDaysSnap" BETWEEN 1 AND 366);

-- Settlement arithmetic must always add up, whatever the application does.
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT settlement_totals_consistent
  CHECK ("orderCount" >= 0 AND "baseCents" >= 0 AND "commissionCents" >= 0 AND "adjustmentCents" <= 0 AND "netDueCents" = "commissionCents" + "adjustmentCents");
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT settlement_month_key_format CHECK ("monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT settlement_paid_has_details
  CHECK (("status" = 'ISSUED' AND "paidAt" IS NULL) OR ("status" = 'PAID' AND "paidAt" IS NOT NULL AND "paymentReference" IS NOT NULL));
ALTER TABLE "CommissionSettlementLine" ADD CONSTRAINT settlement_line_sign
  CHECK (("kind" = 'ORDER' AND "commissionCents" >= 0 AND "baseCents" >= 0) OR ("kind" = 'ADJUSTMENT' AND "commissionCents" < 0));

-- Lines are append-only. Statements can never be deleted and their figures can never change; only the payment columns move.
CREATE TRIGGER settlement_line_append_only BEFORE UPDATE OR DELETE ON "CommissionSettlementLine"
  FOR EACH ROW EXECUTE FUNCTION saqr_forbid_mutation();

CREATE OR REPLACE FUNCTION saqr_settlement_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Settlements cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW."merchantId" IS DISTINCT FROM OLD."merchantId" OR NEW."monthKey" IS DISTINCT FROM OLD."monthKey"
     OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart" OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd"
     OR NEW."orderCount" IS DISTINCT FROM OLD."orderCount" OR NEW."baseCents" IS DISTINCT FROM OLD."baseCents"
     OR NEW."commissionCents" IS DISTINCT FROM OLD."commissionCents" OR NEW."adjustmentCents" IS DISTINCT FROM OLD."adjustmentCents"
     OR NEW."netDueCents" IS DISTINCT FROM OLD."netDueCents" OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt" THEN
    RAISE EXCEPTION 'Settlement figures are frozen' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" = 'PAID' AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt" OR NEW."paymentReference" IS DISTINCT FROM OLD."paymentReference") THEN
    RAISE EXCEPTION 'A paid settlement cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settlement_guard BEFORE UPDATE OR DELETE ON "CommissionSettlement"
  FOR EACH ROW EXECUTE FUNCTION saqr_settlement_guard();
