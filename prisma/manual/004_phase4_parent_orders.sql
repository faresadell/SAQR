-- Phase 4: paste at the end of the generated phase4 migration.sql (see README). NOT yet run against a database.
ALTER TABLE "ParentOrder" ADD CONSTRAINT parent_order_money_non_negative
  CHECK ("subtotalCents" >= 0 AND "deliveryFeeCents" >= 0 AND "totalCents" = "subtotalCents" + "deliveryFeeCents");

-- Suborder money must add up and never be negative.
ALTER TABLE "Order" ADD CONSTRAINT order_money_consistent
  CHECK ("subtotalCents" >= 0 AND "deliveryFeeCents" >= 0 AND "totalCents" = "subtotalCents" - "discountCents" + "deliveryFeeCents");
ALTER TABLE "OrderItem" ADD CONSTRAINT order_item_quantity_positive CHECK ("quantity" >= 1 AND "unitPriceCents" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK ("amountCents" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT refund_amount_positive CHECK ("amountCents" > 0);

-- Only ONE confirmed payment may use the same method + transfer reference (blocks double-confirming a transfer).
CREATE UNIQUE INDEX payment_confirmed_reference_unique ON "Payment" ("method", "referenceNo")
  WHERE "confirmedAt" IS NOT NULL AND "referenceNo" IS NOT NULL;
