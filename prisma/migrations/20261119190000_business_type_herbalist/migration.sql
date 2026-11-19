-- New shop kind: herbalist/spice shops (عطارة). An existing row is never overwritten.
INSERT INTO "BusinessType" ("code", "nameAr", "isActive", "sortOrder", "updatedAt") VALUES
  ('herbalist', 'عطارة', true, 13, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
