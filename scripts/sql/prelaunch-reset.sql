-- SAQR pre-launch reset: removes every NON-ADMIN account and all the test data that hangs off them
-- (orders, payments, shops, drivers, products, offers, chats, notifications, stars, uploaded files, ...).
--
-- KEPT: every ADMIN user (password, permissions, recovery codes, avatar, open sessions) and the platform
-- configuration (settings and their history, commission rates, delivery zones and fees, categories, business
-- types, payment methods, plans, star packages, legal pages) and the audit log.
--
-- It is ONE statement, so it is all-or-nothing: if anything fails, nothing changes.
-- It refuses to run when there is no ADMIN user. THIS CANNOT BE UNDONE: take a Neon backup/branch first.
-- Run scripts/sql/prelaunch-preview.sql first to see the counts.
-- After it, REMOVE the DEMO_PASSWORD/PREVIEW_MODE settings in Vercel, or the next deploy recreates the demo accounts.
DO $reset$
DECLARE
  admins integer;
BEGIN
  SELECT count(*) INTO admins FROM "User" WHERE "role" = 'ADMIN';
  IF admins < 1 THEN
    RAISE EXCEPTION 'No ADMIN user found: refusing to run.';
  END IF;

  -- Every table that is neither kept nor listed here makes the TRUNCATE below fail (a table that points at a
  -- truncated one must be in the same list), so a forgotten table can never be silently half-wiped.
  TRUNCATE
    "OtpCode", "RateLimitHit", "Merchant", "Driver", "DriverLocation", "Product", "Address",
    "StarAccount", "StarLedgerEntry", "Order", "ParentOrder", "OrderItem", "OrderEvent", "Payment", "ReceiptUpload",
    "Subscription", "PlanPurchase", "Membership", "MembershipPurchase", "CommissionSettlement", "CommissionSettlementLine",
    "Notification", "Refund", "DeliveryRecord", "OfferProduct", "Offer", "OfferExtension", "ContestAward", "ContestExclusion",
    "Complaint", "StoredFile", "Conversation", "Message", "OrderRequest", "MerchantPaymentAccount", "Review", "Coupon",
    "NotificationMute"
  RESTART IDENTITY;

  -- Sessions, email codes, avatars and the like of the removed users go with them (ON DELETE CASCADE).
  DELETE FROM "User" WHERE "role" <> 'ADMIN';

  IF (SELECT count(*) FROM "User" WHERE "role" = 'ADMIN') <> admins THEN
    RAISE EXCEPTION 'Admin count changed: rolled back.';
  END IF;
END
$reset$;
