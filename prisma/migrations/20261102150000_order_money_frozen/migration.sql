-- Money and ownership of an order are frozen once it exists: commission, totals, owner and shop can never be rewritten,
-- not by a bug, not by raw SQL. Status columns stay editable. Refunds are separate records, never edits of the order.
CREATE OR REPLACE FUNCTION saqr_order_money_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."customerId" IS DISTINCT FROM OLD."customerId"
     OR NEW."merchantId" IS DISTINCT FROM OLD."merchantId"
     OR NEW."subtotalCents" IS DISTINCT FROM OLD."subtotalCents"
     OR NEW."discountCents" IS DISTINCT FROM OLD."discountCents"
     OR NEW."deliveryFeeCents" IS DISTINCT FROM OLD."deliveryFeeCents"
     OR NEW."totalCents" IS DISTINCT FROM OLD."totalCents"
     OR NEW."merchantTierSnap" IS DISTINCT FROM OLD."merchantTierSnap"
     OR NEW."commissionBp" IS DISTINCT FROM OLD."commissionBp"
     OR NEW."commissionBaseCents" IS DISTINCT FROM OLD."commissionBaseCents"
     OR NEW."commissionCents" IS DISTINCT FROM OLD."commissionCents"
     OR NEW."deliveryRuleSnap"::text IS DISTINCT FROM OLD."deliveryRuleSnap"::text
     OR NEW."addressSnap"::text IS DISTINCT FROM OLD."addressSnap"::text THEN
    RAISE EXCEPTION 'Money and ownership fields of an order cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_money_guard BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION saqr_order_money_guard();
