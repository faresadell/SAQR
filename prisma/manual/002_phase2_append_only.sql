-- Phase 2: history tables are append-only. A change is a NEW row with a new effective date;
-- old rows can never be edited or deleted, so past calculations can never be rewritten.
-- Requires saqr_forbid_mutation() from 001_constraints_and_triggers.sql.

CREATE TRIGGER platform_setting_version_append_only BEFORE UPDATE OR DELETE ON "PlatformSettingVersion"
  FOR EACH ROW EXECUTE FUNCTION saqr_forbid_mutation();

CREATE TRIGGER commission_rate_append_only BEFORE UPDATE OR DELETE ON "CommissionRate"
  FOR EACH ROW EXECUTE FUNCTION saqr_forbid_mutation();

CREATE TRIGGER delivery_fee_version_append_only BEFORE UPDATE OR DELETE ON "DeliveryFeeVersion"
  FOR EACH ROW EXECUTE FUNCTION saqr_forbid_mutation();

-- Sanity bounds enforced by the database as a last line of defense.
ALTER TABLE "CommissionRate" ADD CONSTRAINT commission_rate_range CHECK ("basisPoints" >= 0 AND "basisPoints" <= 5000);
ALTER TABLE "DeliveryFeeVersion" ADD CONSTRAINT delivery_fee_range CHECK ("feeCents" >= 0 AND "feeCents" <= 100000);
