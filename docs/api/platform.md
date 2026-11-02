# Platform REST contracts (phase 8)

All mutations: JSON body, same-origin, session cookie. Errors: `{ ok:false, error, ... }`. Owner-scoped lookups answer 404 for other people's records.

- `GET/POST /api/v1/addresses`, `PATCH/DELETE /api/v1/addresses/{id}` — customer only; `{ line, zoneId, label?, lat?, lng? }`; zone must be active; max 10 saved addresses (`TOO_MANY_ADDRESSES`). Orders keep their own address snapshot.
- `POST /api/v1/auth/password-reset/request` `{ phone }` OR `{ email }` (exactly one) → always `{ ok:true }` for valid formats (no account disclosure; admins excluded). Email works only for an address verified on the account. `POST .../confirm` `{ phone|email, code, newPassword }` → `INVALID_CODE | WEAK_PASSWORD | RATE_LIMITED`. Success signs out every device.
- `GET /api/v1/admin/audit?action&entityType&entityId&cursor&limit` — permission `audit.view`; newest first, `nextCursor`.
- `POST/GET /api/v1/complaints` `{ orderId, subject, details }` (customer, own orders, daily limit). Admin: `GET /api/v1/admin/complaints?status`, `POST /api/v1/admin/complaints/{id}` `{ to: IN_REVIEW|RESOLVED|DISMISSED, response }` — permission `complaints.manage`; closed complaints are frozen by a DB trigger.
- `GET /api/v1/reports/sales?month=YYYY-MM` (merchant, own) and `GET /api/v1/admin/reports/sales?month=` (platform). Cairo-month boundaries, commission at each order's stored rate, refunds subtracted.
- `POST /api/v1/products/{id}/image` multipart `file` (JPEG/PNG/WebP, ≤ 5 MB, type decided from bytes); `GET` serves it only while the product and shop are visible.
- Offers, contest, drivers, cancellation and admin settings contracts: see docs/PHASE4.md and docs/api/orders.md.

## Email, recovery codes, legal pages (phase 9)
- `POST /api/v1/account/email` `{ email }` (signed in) → emails a 6-digit code valid 10 minutes; same answer even if the address belongs to someone else. `POST /api/v1/account/email/confirm` `{ code }` → `{ email }`. Errors: `INVALID_CODE`, `EMAIL_TAKEN` (409), `ALREADY_VERIFIED` (409), `RATE_LIMITED`, `SEND_FAILED` (502).
- Administrators: `GET /api/v1/admin/recovery-codes` → `{ unused }`; `POST` `{ password }` → `{ codes: [10 single-use codes] }` shown ONCE (older codes stop working). At login an admin may send `recoveryCode` INSTEAD of `totp` (the login form must offer this field). Every use is audited.
- `GET /api/v1/legal`, `GET /api/v1/legal/{terms|privacy|cancellation|refund|support|contest}` (public) → `{ slug, title, body, version, approved }`. Show a clear "مسودة غير معتمدة" label while `approved=false`. Admin (`content.manage`): `POST /api/v1/admin/legal/{slug}` `{ action:"edit", title, body, expectedVersion }` or `{ action:"approve", expectedVersion }`; editing removes approval; `409 STALE_VERSION`.

## Offers with discounts and the contest (phase 10)
- `POST /api/v1/offers` also accepts `discount: { type: "PERCENT"|"FIXED", value }` (PERCENT in basis points, FIXED in piasters per unit) and `productIds`. Discounts are OFF until an administrator sets `offers.discount.enabled=1`. Errors (409): `DISCOUNTS_DISABLED`, `DISCOUNT_INVALID`, `DISCOUNT_ABOVE_LIMIT`, `FINAL_PRICE_NOT_POSITIVE`, `TOO_MANY_DISCOUNTED_OFFERS`, `PRODUCT_ALREADY_IN_OFFER`.
- `GET /api/v1/offers` returns `discount` and `products[{ priceCents, finalPriceCents }]` only while discounts are on.
- Checkout: `expectedUnitPriceCents` is the price the customer SAW, after discount. A mismatch returns `PRICE_CHANGED` (never silently repriced). Each order item stores `unitPriceCents` (original), `unitDiscountCents`, `discountCents`, `lineTotalCents` (final) and `offerId`; order `subtotalCents` and the commission base are the discounted product value (delivery excluded).
- Contest (admin, `contest.manage`): `GET /api/v1/admin/contest/standings?month=YYYY-MM` (preview any time), `POST` `{ monthKey }` proposes the top 3 of a CLOSED month (needs `contest.enabled=1` and the approved `contest` rules page), `POST/DELETE /api/v1/admin/contest/exclusions` to exclude/restore a participant with a reason. Then the existing approve → pay flow in `/api/v1/admin/contest/awards`.
- `GET /api/v1/payment-methods` now includes `automatic: { available:false, reason:"GATEWAY_NOT_CONFIGURED" }`: automatic payment does not exist yet; manual transfer with proof stays.
