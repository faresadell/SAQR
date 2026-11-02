-- One approved set of star packages: 30 / 50 / 100 stars, 1 star = 1 EGP, no bonus, for customers, drivers and merchants.
-- Safe for existing data: nothing is deleted or rewritten. Old plans stay (purchases, subscriptions and star balances keep
-- pointing at them and keep their own price/star snapshots); they are only taken off sale.
INSERT INTO "Plan" ("id","code","audience","nameAr","priceCents","baseStars","bonusStars","offerQuota","isActive","sortOrder","updatedAt")
SELECT 'plan_' || lower(a.aud) || '_stars_' || s.stars,
       lower(a.aud) || '_stars_' || s.stars,
       a.aud::"PlanAudience",
       CASE a.aud WHEN 'CUSTOMER' THEN 'عميل' WHEN 'DRIVER' THEN 'سائق' ELSE 'تاجر' END || ' ' || s.stars || ' نجمة',
       s.stars * 100, s.stars, 0, NULL, true,
       a.ord * 10 + s.ord, now()
FROM (VALUES ('CUSTOMER',1),('DRIVER',2),('MERCHANT',3)) AS a(aud, ord)
CROSS JOIN (VALUES (30,1),(50,2),(100,3)) AS s(stars, ord)
ON CONFLICT ("code") DO NOTHING;

UPDATE "Plan" SET "isActive" = false, "updatedAt" = now()
WHERE "code" IN ('customer_bronze','customer_silver','customer_gold','driver_basic','merchant_bronze','merchant_silver','merchant_gold')
  AND "isActive" = true;
