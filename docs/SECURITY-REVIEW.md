# Security review (manual + automated) — 2026-11-02

Scope: code at `main` after PR #27. Method: reading the code paths named below and the automated tests that cover them. **This is a code review, not a penetration test, and nothing here was run against a real deployment.** Items marked NOT VERIFIED must be checked by a person.

## Fixed in this review
1. **Account-existence oracle in password reset (fixed, tested).** The per-account hourly send cap returned "too many attempts" only for REAL accounts, so repeated requests could reveal that an address/number is registered. The per-account cap is now silent for reset requests (no email/code is sent, answer stays neutral); only the per-IP cap is reported, and it applies equally to unknown accounts. Test: `password-reset.integration.test.ts`.
2. **Order money and ownership were editable at the database level (fixed, tested).** Any bug or raw SQL could rewrite `commissionBp`, totals, `merchantId`, `customerId` after the fact, silently changing commission statements. Migration `20261102150000_order_money_frozen` adds a trigger that rejects changes to those columns (status columns remain editable). Test: `settlements.integration.test.ts` ("tamper resistance").

## How access is enforced (verified by reading the code)
- Layers: `admin/`, `merchant/`, `driver/` layouts call `requireRole`; `/account` calls `requireUser`; every server action calls `requireRole/requirePermission/requireUser` and the **service** re-checks the permission itself (so a page that forgot a guard still cannot act). All `/api/v1/**` handlers except the password-reset and legal-page ones start with `currentActor()`; the internal job route requires `Authorization: Bearer CRON_SECRET` compared with `timingSafeEqual`.
- Mutating JSON routes call `checkMutation` (JSON content-type + same-origin check). The four multipart upload routes call `checkOrigin`, cap size (`MAX_RECEIPT_BYTES` 5 MB) and sniff the real image type (a renamed PDF is refused).
- Private files: the bucket is only ever read through our routes. `readReceipt` allows the uploader (plan proof), the order's customer, the order's shop owner, or an admin with `payments.review`; everyone else gets "not found". Every view writes a `RECEIPT_VIEWED` audit row. Responses carry `nosniff`, a sandbox CSP and `no-store`.
- Roles: customers only reach their own addresses/orders (`mustBeCustomer`, `userId` in every `where`); a shop sees only its own orders, drivers, settlements; admins act by named permission (`settings.manage`, `payments.review`, `settlements.manage`, `catalog.manage`, `content.manage`, `audit.view` …), a limited admin is refused in tests.
- Settings changes need `settings.manage`, are range-checked by the registry, versioned append-only and audited (`SETTING_CHANGED`); payment receiver/enable changes are audited with before/after.
- Admin sign-in is email + password only (the authenticator step was removed at the owner's request on 2026-11-06: a known weaker setting than two-factor). Legacy TOTP columns/recovery-code tables remain in the database but are no longer used at login.
- Audit: `AuditLog`, order events, star ledger, setting versions, settlement lines are append-only in the database. Sensitive operations write audit rows (orders, payments, refunds, settlements, offers, contest awards, legal approval, user suspension, merchant status, setting/commission/fee changes, admin login and recovery-code use).
- Production guards in `env.ts`: the console OTP and console email senders (which print codes) are refused when `NODE_ENV=production`; R2 needs all four values.
- Secrets: logs print no keys; the dev senders print codes only outside production.

## Remaining risks / NOT VERIFIED
| # | Item | Status |
|---|------|--------|
| 1 | **Sign-up no longer needs SMS (changed 2026-11-03).** Accounts are activated by the code emailed to the user, so Resend must really work (REAL-TESTS section 1). **Side effect: the phone number is a login/contact number that is NOT proven by a code.** Someone can register another person's number first and the real owner is then refused (the answer stays neutral). Drivers' and shops' phone numbers shown to customers are as claimed by the user. Mitigation later: an SMS provider, or login by email. | Accepted risk — owner decision |
| 1b | The robot check needs a real Cloudflare Turnstile widget; production refuses to start without it. Not tested against Cloudflare from here (the verification call is unit-tested with a fake). | NOT RUN — needs your account |
| 2 | Resend and R2 real behaviour (domain verified, delivery, bucket privacy, key permissions). | NOT RUN — needs your accounts; steps in `docs/REAL-TESTS.md` |
| 3 | (removed) authenticator enrollment: no longer part of admin sign-in. | n/a |
| 4 | Page-by-page review was done by pattern (layout + action + service + route guards), not by clicking every page as every role. Loaders were read for the pages touched in the last batches only. | Manual role walkthrough recommended (checklist in the final report) |
| 5 | Refunds: the database allows several refund rows per order but the order lifecycle only opens one (`refundStatus` must be NONE). A second refund would not get a second commission adjustment (`@@unique(orderId, kind)`). Not reachable through the app today. | Low, documented |
| 6 | General API rate limiting exists for auth/OTP/email paths only; other routes rely on authentication. A reverse proxy / WAF limit is advisable. | Recommendation |
| 7 | The `SonarCloud` check is advisory; the `npm audit` step in CI is the dependency check. | Info |
| 8 | Dependabot: majors held back with verified reasons (`docs/DEPENDENCIES.md`). | Info |

## Not changed on purpose
Terms and Privacy pages stay unapproved drafts until you approve a version; no support contact data was invented.

---

# Addendum — review of the features added after PR #27 (2026-11-17, code at `main` after PR #103)

Same method and same limits: a reading of the code paths below plus the automated tests that cover them. **Not a penetration test; nothing was run against the real site; CI green is not a launch approval.**

## Checked by reading, with the tests that cover them
- **Guards on every entry point.** Server actions go through `requireRole`/`requirePermission` or the `run`/`productCommand` wrappers, and each service re-checks the actor. An automated scan of all `"use server"` files and all `/api/**` routes found no entry point without a guard, except the intentionally public ones (legal pages, public shop picture, health check, own avatar, sign-in/sign-up/reset which have rate limits and a robot check).
- **Money is decided on the server.** Coupon discounts, delivery fee, stars and totals are computed inside the order transaction (`coupons.integration.test.ts`); the checkout preview is advisory only.
- **Pictures** (chat, product, offer, shop, receipts): the file type is decided from the bytes, size capped at 5 MB, stored under a fresh private key (nothing overwritten), served with `nosniff` and a sandbox CSP. Chat pictures are served only to the two conversation participants. Product and offer pictures are public only while the product/offer is visible to shoppers. Owner-only upload is tested (`discounts.integration.test.ts`).
- **Reviews, notification mutes, analytics, monitoring:** ownership and permission checks are in the service layer and tested; order/payment/refund/plan notifications cannot be muted.
- **SQL:** the only raw queries are tagged templates or `Prisma.sql` with bound parameters (no string concatenation).
- **Map picker:** tiles load only from `tile.openstreetmap.org` (CSP `img-src`); coordinates are range-checked to Egypt on the server.

## Fixed in this review
1. **Catalog flooding.** A shop owner could create products without limit (script or stolen session). Product creation is now limited to 100 per hour per shop owner (`phase3.integration.test.ts`).

## Remaining risks / NOT VERIFIED
| # | Item | Status |
|---|------|--------|
| A1 | Public product search and shop pages have no per-IP rate limit (bounded to 60 rows, read-only). A reverse proxy or WAF limit is still advisable (see #6 above). | Recommendation |
| A2 | Replacing a product/offer/shop picture leaves the old file in storage (orphan files; cost only, not exposure). A cleanup job is not built. | Low, known |
| A3 | Platform coupons: the discount is paid by the platform, but there is no automated settlement to merchants; an admin sees the owed total. The owner has not decided how it is settled. | Needs owner decision |
| A4 | Not tested on real phones: map drag/pinch, camera capture, intro sound, picture upload from a phone gallery. | NOT RUN — needs a person |
| A5 | Image storage in production depends on the configured provider (`STORAGE_PROVIDER`); persistence across deploys must be checked on the real site (upload, redeploy, reload). | NOT RUN — needs your accounts |
| A6 | The email channel for notifications is not built (in-app notifications only). | Not built on purpose |
