-- Read-only: what scripts/sql/prelaunch-reset.sql would remove and keep. Changes nothing.
SELECT 'KEEP  admin users' AS what, count(*) AS n FROM "User" WHERE "role" = 'ADMIN'
UNION ALL SELECT 'REMOVE customers', count(*) FROM "User" WHERE "role" = 'CUSTOMER'
UNION ALL SELECT 'REMOVE merchants (accounts)', count(*) FROM "User" WHERE "role" = 'MERCHANT'
UNION ALL SELECT 'REMOVE drivers (accounts)', count(*) FROM "User" WHERE "role" = 'DRIVER'
UNION ALL SELECT 'REMOVE shops', count(*) FROM "Merchant"
UNION ALL SELECT 'REMOVE products', count(*) FROM "Product"
UNION ALL SELECT 'REMOVE orders', count(*) FROM "Order"
UNION ALL SELECT 'REMOVE offers', count(*) FROM "Offer"
UNION ALL SELECT 'REMOVE uploaded files', count(*) FROM "StoredFile"
UNION ALL SELECT 'KEEP  categories', count(*) FROM "Category"
UNION ALL SELECT 'KEEP  delivery zones', count(*) FROM "DeliveryZone"
UNION ALL SELECT 'KEEP  audit log rows', count(*) FROM "AuditLog";
