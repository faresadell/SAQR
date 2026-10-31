# Platform REST contracts (phase 8)

All mutations: JSON body, same-origin, session cookie. Errors: `{ ok:false, error, ... }`. Owner-scoped lookups answer 404 for other people's records.

- `GET/POST /api/v1/addresses`, `PATCH/DELETE /api/v1/addresses/{id}` — customer only; `{ line, zoneId, label?, lat?, lng? }`; zone must be active; max 10 saved addresses (`TOO_MANY_ADDRESSES`). Orders keep their own address snapshot.
- `POST /api/v1/auth/password-reset/request` `{ phone }` → always `{ ok:true }` for valid phone formats (no account disclosure; admins excluded). `POST .../confirm` `{ phone, code, newPassword }` → `INVALID_CODE | WEAK_PASSWORD | RATE_LIMITED`. Success signs out every device.
- `GET /api/v1/admin/audit?action&entityType&entityId&cursor&limit` — permission `audit.view`; newest first, `nextCursor`.
- `POST/GET /api/v1/complaints` `{ orderId, subject, details }` (customer, own orders, daily limit). Admin: `GET /api/v1/admin/complaints?status`, `PATCH /api/v1/admin/complaints/{id}` `{ status: IN_REVIEW|RESOLVED|DISMISSED, response }` — permission `complaints.manage`; closed complaints are frozen by a DB trigger.
- `GET /api/v1/reports/sales?month=YYYY-MM` (merchant, own) and `GET /api/v1/admin/reports/sales?month=` (platform). Cairo-month boundaries, commission at each order's stored rate, refunds subtracted.
- `POST /api/v1/products/{id}/image` multipart `file` (JPEG/PNG/WebP, ≤ 5 MB, type decided from bytes); `GET` serves it only while the product and shop are visible.
- Offers, contest, drivers, cancellation and admin settings contracts: see docs/PHASE4.md and docs/api/orders.md.
