-- Database-level guarantees Prisma cannot express. Apply once, inside the first migration
-- (see README: "Initial migration"). These make the key money/audit rules unbreakable even if
-- application code has a bug.

-- Star balances can never go negative.
ALTER TABLE "StarAccount" ADD CONSTRAINT star_balance_non_negative CHECK ("balance" >= 0);

-- Ledger rows must change something.
ALTER TABLE "StarLedgerEntry" ADD CONSTRAINT star_ledger_amount_non_zero CHECK ("amount" <> 0);

-- Append-only tables: any UPDATE or DELETE is rejected.
CREATE OR REPLACE FUNCTION saqr_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER star_ledger_append_only BEFORE UPDATE OR DELETE ON "StarLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION saqr_forbid_mutation();

CREATE TRIGGER order_event_append_only BEFORE UPDATE OR DELETE ON "OrderEvent"
  FOR EACH ROW EXECUTE FUNCTION saqr_forbid_mutation();

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION saqr_forbid_mutation();
