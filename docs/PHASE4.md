# Phase 4 (in progress): multi-merchant orders, stars and plans — status

**Branch `phase-4-orders`. Written without being able to install npm packages, so `tsc`, ESLint, vitest, Prisma, PostgreSQL and `next build` were NOT run.** Services, routes and integration tests below are untested code.
What WAS run: the new pure modules below were type-checked with strict `tsc` and their tests executed with a minimal stand-in for vitest.

## Done (pure logic, tested)
- `src/lib/orders/checkout.ts` — cart -> quote: one suborder per merchant, exact integer totals, merges duplicate lines, refuses (never silently reprices) on missing / unavailable / archived products, changed price, bad quantity, bad fee.
- `src/lib/orders/status.ts` — suborder state machine, parent status derived from suborders, and what each transition does to stars (charge once on approval, refund once on cancel after charge).
- `src/lib/stars/rules.ts` — Cairo day/month keys, deterministic ledger idempotency keys, minimum-balance gate, daily 1-star decision (never negative), monthly reward tiers (15/25/40 = 80), default plan table (spec 3.1–3.3), 30-day expiry with early-renewal carry-over, 3-day reminder time.
- Stars default per party per suborder changed 5 -> 2 (the newer rule). The minimum balance setting stays 5 and is separate. An existing database keeps whatever value an admin saved; only the default changed.
- Schema: `ParentOrder` + nullable `Order.parentOrderId`. `Order` is the suborder; nothing was renamed or dropped. SQL guard in `prisma/manual/004_phase4_parent_orders.sql`. **No migration file generated or applied.**

## Written but NOT run (needs your machine / CI)
- `src/server/stars/ledger.ts` — the only code that changes a balance: row lock, idempotency key, no negative balance.
- `src/server/orders/checkout.ts` — `placeOrder` (one transaction, idempotent, server-side prices/fees/commission snapshot).
- `src/server/orders/lifecycle.ts` — payment submit / confirm / reject, approve (charges stars once), reject, advance, cancel (refunds stars once, opens a Refund if paid).
- `src/server/orders/read.ts`, `src/server/api/http.ts`, `src/app/api/v1/orders/**` — REST contract, documented in `docs/api/orders.md`.
- `src/server/orders/phase4.integration.test.ts` — 11 integration tests (idempotency, charge/refund once, concurrent approvals, IDOR, duplicate transfer).
- `prisma/manual/004_phase4_parent_orders.sql` — CHECKs and a unique index for confirmed transfer references.
To run: `npm install && npx prisma migrate dev --name phase4 --create-only` (paste 004 into it) then `npm run typecheck && npm run lint && npm test && DATABASE_URL=... npm run test:integration`.

## NOT done yet (nothing here is claimed to work)
- Receipt upload service (the `receiptKey` field expects it), refund proof/verification, cancellation after APPROVED stages.
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
