-- Phase 4: paste at the end of the generated phase4 migration.sql (see README). NOT yet run against a database.
ALTER TABLE "ParentOrder" ADD CONSTRAINT parent_order_money_non_negative
  CHECK ("subtotalCents" >= 0 AND "deliveryFeeCents" >= 0 AND "totalCents" = "subtotalCents" + "deliveryFeeCents");
