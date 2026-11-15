-- New shop kinds. Existing rows are never overwritten (an admin may already have renamed them).
INSERT INTO "BusinessType" ("code", "nameAr", "isActive", "sortOrder", "updatedAt") VALUES
  ('fish', 'أسماك', true, 7, CURRENT_TIMESTAMP),
  ('cosmetics', 'مستحضرات تجميل', true, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- "Clothes" is removed from the offered kinds. It is hidden, not deleted, so shops that already use it stay valid (an admin can delete it later).
UPDATE "BusinessType" SET "isActive" = false WHERE "code" = 'clothes';
