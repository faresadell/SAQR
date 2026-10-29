-- Phase 3: database-level guards for the catalog. Apply once (after 001 and 002).

-- A product price is a positive number of piasters, capped at 100,000 EGP.
ALTER TABLE "Product" ADD CONSTRAINT product_price_range CHECK ("priceCents" >= 1 AND "priceCents" <= 10000000);
