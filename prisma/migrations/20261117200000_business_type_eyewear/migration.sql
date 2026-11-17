-- New shop kinds: eyewear and school stationery/bookshops. An existing row is never overwritten (an admin may already have added or renamed it).
INSERT INTO "BusinessType" ("code", "nameAr", "isActive", "sortOrder", "updatedAt") VALUES
  ('eyewear', 'نظارات', true, 11, CURRENT_TIMESTAMP),
  ('stationery', 'مكتبات دراسية', true, 12, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
