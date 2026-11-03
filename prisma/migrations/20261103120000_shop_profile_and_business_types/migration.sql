-- Shop picture, extra contact numbers and social links (set by an admin when adding or editing a shop).
ALTER TABLE "Merchant" ADD COLUMN "imageKey" TEXT,
ADD COLUMN "contactPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "socialLinks" JSONB;
UPDATE "Merchant" SET "contactPhones" = ARRAY[]::TEXT[] WHERE "contactPhones" IS NULL;
ALTER TABLE "Merchant" ALTER COLUMN "contactPhones" SET NOT NULL;

-- Ready-made categories. Existing rows are never touched; an admin can rename, hide or add more.
INSERT INTO "BusinessType" ("code", "nameAr", "isActive", "sortOrder", "updatedAt") VALUES
  ('restaurant', 'مطاعم', true, 1, CURRENT_TIMESTAMP),
  ('supermarket', 'سوبر ماركت', true, 2, CURRENT_TIMESTAMP),
  ('phones', 'تليفونات', true, 3, CURRENT_TIMESTAMP),
  ('pharmacy', 'صيدليات', true, 4, CURRENT_TIMESTAMP),
  ('bakery', 'مخابز وحلويات', true, 5, CURRENT_TIMESTAMP),
  ('greengrocer', 'خضار وفاكهة', true, 6, CURRENT_TIMESTAMP),
  ('clothes', 'ملابس', true, 7, CURRENT_TIMESTAMP),
  ('electronics', 'أجهزة وإلكترونيات', true, 8, CURRENT_TIMESTAMP),
  ('home', 'أدوات منزلية', true, 9, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
