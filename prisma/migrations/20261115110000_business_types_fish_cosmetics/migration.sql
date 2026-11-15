-- New shop kinds. Existing rows are never overwritten (an admin may already have renamed them).
INSERT INTO "BusinessType" ("code", "nameAr", "isActive", "sortOrder", "updatedAt") VALUES
  ('fish', 'أسماك', true, 7, CURRENT_TIMESTAMP),
  ('cosmetics', 'مستحضرات تجميل', true, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- "Clothes" is removed: deleted when no shop uses it, otherwise only hidden so those shops keep a valid kind.
DELETE FROM "BusinessType" WHERE "code" = 'clothes' AND NOT EXISTS (SELECT 1 FROM "Merchant" WHERE "businessType" = 'clothes');
UPDATE "BusinessType" SET "isActive" = false WHERE "code" = 'clothes';
