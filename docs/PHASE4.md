# Phase 4 (in progress): multi-merchant orders, stars and plans — status

**Branch `phase-4-orders` (draft PR #8).** The code was written without local npm/PostgreSQL, then verified by the repository's GitHub Actions CI (real PostgreSQL 16): `prisma validate`, `tsc`, ESLint, unit tests, database guards (001–004 SQL) and ALL integration tests (Phase 3 + the Phase 4 ones below) pass. NOT verified: `next build`, and anything not covered by those tests (see "NOT done yet").
**CI still fails only at `npm audit`** (high-severity advisories in `zod` <4.6.6, `prisma`/`@prisma/config`/`deepmerge-ts`, `next`/`postcss`). Fixing needs major upgrades (zod 4, prisma 7, next 16); Dependabot already opened those PRs. Upgrade them one at a time with a committed `package-lock.json`; the audit check was not weakened.
What WAS run: the new pure modules below were type-checked with strict `tsc` and their tests executed with a minimal stand-in for vitest.

## Done (pure logic, tested)
- `src/lib/orders/checkout.ts` — cart -> quote: one suborder per merchant, exact integer totals, merges duplicate lines, refuses (never silently reprices) on missing / unavailable / archived products, changed price, bad quantity, bad fee.
- `src/lib/orders/status.ts` — suborder state machine, parent status derived from suborders, and what each transition does to stars (charge once on approval, refund once on cancel after charge).
- `src/lib/stars/rules.ts` — Cairo day/month keys, deterministic ledger idempotency keys, minimum-balance gate, daily 1-star decision (never negative), monthly reward tiers (15/25/40 = 80), default plan table (spec 3.1–3.3), 30-day expiry with early-renewal carry-over, 3-day reminder time.
- Stars default per party per suborder changed 5 -> 2 (the newer rule). The minimum balance setting stays 5 and is separate. An existing database keeps whatever value an admin saved; only the default changed.
- Schema: `ParentOrder` + nullable `Order.parentOrderId`. `Order` is the suborder; nothing was renamed or dropped. SQL guard in `prisma/manual/004_phase4_parent_orders.sql`. **No migration file generated or applied.**

## Written and CI-verified (see status above)
- `src/server/stars/ledger.ts` — the only code that changes a balance: row lock, idempotency key, no negative balance.
- `src/server/orders/checkout.ts` — `placeOrder` (one transaction, idempotent, server-side prices/fees/commission snapshot).
- `src/server/orders/lifecycle.ts` — payment submit / confirm / reject, approve (charges stars once), reject, advance, cancel (refunds stars once, opens a Refund if paid).
- `src/server/orders/read.ts`, `src/server/api/http.ts`, `src/app/api/v1/orders/**` — REST contract, documented in `docs/api/orders.md`.
- `src/server/orders/phase4.integration.test.ts` — 13 integration tests (idempotency, charge/refund once, concurrent approvals, IDOR, duplicate transfer).
- `src/server/stars/jobs.ts` + `POST /api/internal/jobs/{daily-stars|monthly-rewards}` (Bearer `CRON_SECRET`, 503 until set): daily 1-star charge by Cairo day and monthly reward tiers; both idempotent. Needs a scheduler (e.g. hourly) calling them; new StarReason values DAILY_CHARGE / MONTHLY_REWARD / PLAN_GRANT need a migration.
- `prisma/manual/004_phase4_parent_orders.sql` — CHECKs and a unique index for confirmed transfer references.
To run locally: `npm install && npx prisma migrate dev --name phase4 --create-only` (paste 004 into it) then `npm run typecheck && npm run lint && npm test && DATABASE_URL=... npm run test:integration`.

## Added later on this branch (all CI-verified with PostgreSQL)
- Receipts: private storage, content-sniffed JPEG/PNG/WebP only, owner-scoped download, payments bound to your own single-use upload, same picture on another order is flagged.
- Plans: catalog (seeded from the agreed table, admin-editable), purchase with proof, admin approval, 30-day cycle with early-renewal carry-over, base + bonus stars granted once, stars survive expiry. Endpoints in `docs/api/orders.md`.
- Notifications: in-app inbox wired to orders, plans and refunds (no push/SMS/email provider exists). Jobs: `daily-stars`, `monthly-rewards`, `plan-reminders`, `refund-overdue`.
- Refunds: merchant proof upload, admin verification (`refunds.verify`), overdue escalation to admins.
- SQL guards `prisma/manual/005_phase5_plans.sql` (one pending purchase per user, one approved purchase per transfer).
- Production needs: `UPLOAD_DIR` on a persistent private volume, `CRON_SECRET`, a scheduler calling the four jobs hourly, and real migrations (CI uses `db push`).

## NOT done yet (nothing here is claimed to work)
- Merchant offers (24h default, 1 star/hour extension, quota per plan cycle): the content of an offer (discount type, scope) was never specified, so it was not invented.
- Merchant membership purchase (Plus/Premium), monthly commission settlements, monthly contest and payouts, driver/delivery phase, admin screens for settings (settings API exists only as server actions), `CANCELLATION_REQUESTED` flow after approval.
- Plans tables, activation, daily-charge job, monthly reward job, offers, payments review, refunds, memberships, contest, notifications, file upload, API docs.
- Integration tests (need PostgreSQL).

## Assumptions to confirm
1. Suborder flow: receipt -> merchant confirms transfer -> merchant approves (stars charged) -> prepare -> deliver. Inferred from the existing enums.
2. Delivery fee: each suborder pays its own zone fee (drivers belong to a merchant in the current model, so routes are not merged). Extra-stop fees need a decision.
3. Daily charge when balance is 0: skipped, no suspension or debt (no approved policy).
4. Existing model has Basic/Premium merchant tiers with 8%/5% commission; the Bronze/Silver/Gold plans in the master spec are a separate, new concept (plans), not a replacement. Confirm.

## More assumptions made in code (confirm)
5. A rejected/cancelled order whose transfer was confirmed opens a Refund for the full amount the customer paid (products + that suborder's delivery fee), because no partial rule was given.
6. After approval only the shop owner or an admin with `payments.review` can cancel (customer cannot); only from `APPROVED`.
7. Orders are refused (`TRADING_NOT_CONFIGURED`) until an admin sets `orders.merchant_response_minutes` (from the Phase 2 doc).
8. A shop must be approved, open now (Cairo hours), owner ACTIVE and hold the minimum stars for its products to be orderable.


## Memberships and settlements: assumptions

- Memberships are for merchants (Plus 30 EGP, Premium 60 EGP, 30 days). Premium -> commission tier BUSINESS (5%); Plus has no specified benefit, so the shop stays on the regular 8%. Rates were not changed.
- Settlements charge a suborder once, in the month it reached DELIVERED (Cairo), at the rate stored in the order. A partial refund reduces the base (no product/delivery split exists yet); a refund completed after issuing creates a negative adjustment in a later statement.
- Open questions for the owner: what Plus should give; how and when merchants pay the commission (the system only records that an admin confirmed receipt); whether delivery fees should be excluded from the commission base; offers (discount type/scope) are NOT implemented until defined.
