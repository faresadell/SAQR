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
- Admin sign-in needs password + TOTP (or a one-time recovery code). A TOTP step can't be reused (`lastTotpStep`). TOTP secrets are encrypted at rest with `DATA_ENCRYPTION_KEY`. Recovery codes work once (tested).
- Audit: `AuditLog`, order events, star ledger, setting versions, settlement lines are append-only in the database. Sensitive operations write audit rows (orders, payments, refunds, settlements, offers, contest awards, legal approval, user suspension, merchant status, setting/commission/fee changes, admin login and recovery-code use).
- Production guards in `env.ts`: the console OTP and console email senders (which print codes) are refused when `NODE_ENV=production`; R2 needs all four values.
- Secrets: logs print no keys; the dev senders print codes only outside production.

## Remaining risks / NOT VERIFIED
| # | Item | Status |
|---|------|--------|
| 1 | **No SMS provider.** Registration sends a phone code; with `OTP_PROVIDER=disabled` (the only production-legal value without a gateway) new users cannot verify their phone, so **customers cannot register in production**. Needs either an SMS gateway (`OTP_PROVIDER=http` + `SMS_API_URL/SMS_API_TOKEN/SMS_SENDER`) or a product decision to allow email-based sign-up. | LAUNCH BLOCKER |
| 2 | Resend and R2 real behaviour (domain verified, delivery, bucket privacy, key permissions). | NOT RUN — needs your accounts; steps in `docs/REAL-TESTS.md` |
| 3 | TOTP enrollment through `npm run admin:create` and recovery-code login with a real authenticator. | NOT RUN — manual |
| 4 | Page-by-page review was done by pattern (layout + action + service + route guards), not by clicking every page as every role. Loaders were read for the pages touched in the last batches only. | Manual role walkthrough recommended (checklist in the final report) |
| 5 | Refunds: the database allows several refund rows per order but the order lifecycle only opens one (`refundStatus` must be NONE). A second refund would not get a second commission adjustment (`@@unique(orderId, kind)`). Not reachable through the app today. | Low, documented |
| 6 | General API rate limiting exists for auth/OTP/email paths only; other routes rely on authentication. A reverse proxy / WAF limit is advisable. | Recommendation |
| 7 | The `SonarCloud` check is advisory; the `npm audit` step in CI is the dependency check. | Info |
| 8 | Dependabot: majors held back with verified reasons (`docs/DEPENDENCIES.md`). | Info |

## Not changed on purpose
Terms and Privacy pages stay unapproved drafts until you approve a version; no support contact data was invented.
