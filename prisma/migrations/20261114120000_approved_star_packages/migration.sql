-- Owner-approved star packages (14 Nov 2026): customer 50+15 / 75+25 / 100+35, merchant 100+15 / 150+25 / 200+35.
-- Driver packages are unchanged. Price = paid stars x 1 EGP (assumption, admin-editable). Nothing is deleted: purchases and
-- subscriptions keep their own snapshots; packages that are no longer offered are only taken off sale.
UPDATE "Plan" SET "bonusStars" = 15, "updatedAt" = now() WHERE "code" IN ('customer_stars_50','merchant_stars_100') AND "bonusStars" = 0;
UPDATE "Plan" SET "bonusStars" = 35, "updatedAt" = now() WHERE "code" = 'customer_stars_100' AND "bonusStars" = 0;

INSERT INTO "Plan" ("id","code","audience","nameAr","priceCents","baseStars","bonusStars","offerQuota","isActive","sortOrder","updatedAt")
VALUES
  ('plan_customer_stars_75','customer_stars_75','CUSTOMER','عميل 75 نجمة',7500,75,25,NULL,true,12,now()),
  ('plan_merchant_stars_150','merchant_stars_150','MERCHANT','تاجر 150 نجمة',15000,150,25,NULL,true,32,now()),
  ('plan_merchant_stars_200','merchant_stars_200','MERCHANT','تاجر 200 نجمة',20000,200,35,NULL,true,33,now())
ON CONFLICT ("code") DO NOTHING;

UPDATE "Plan" SET "isActive" = false, "updatedAt" = now() WHERE "code" IN ('customer_stars_30','merchant_stars_30','merchant_stars_50') AND "isActive" = true;
