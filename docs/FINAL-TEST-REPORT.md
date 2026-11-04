# SAQR — Final test report

Commit tested: see `git log -1` on `main` (CI results below are for the merge of PR #41, `78b94b5`). Date: 2026-11-04.
Honest scope: everything below ran in GitHub Actions with a real PostgreSQL 16 and **fake** email/storage/robot-check services. Nothing was run against real Resend, R2, Turnstile, or a real authenticator app.

## What ran and passed (CI on PR #41, all green)
| Check | Result |
|---|---|
| TypeScript typecheck | passed |
| ESLint | passed |
| Unit tests | passed |
| `prisma migrate deploy` on an empty database | passed |
| Production build (`next build`) | passed |
| Integration tests (real PostgreSQL) | passed |
| `npm audit --omit=dev --audit-level=high` | passed (no high/critical findings) |
| SonarCloud quality gate | passed |
| E2E in a real Chromium, desktop and mobile (36 tests; one run of the admin test hit a transient double-`<main>` timing issue in dev mode, fixed in the test, then 36/36) | passed |

E2E coverage (real browser, `next dev`): public pages (no console errors, no horizontal scroll), sign-up by emailed code for customer/merchant/driver, phone change, admin sign-in with a one-time authenticator code, admin adds a shop with owner/picture/contacts, admin offer, and the **full order journey**: stars bought → admin approves → order placed → receipt sent → shop confirms, accepts, prepares → driver accepts, picks up, delivers → customer sees delivery and the driver's name.

## Defects found by these tests and fixed
1. Shop order buttons (confirm transfer, accept, prepare, cancel, assign driver) never submitted.
2. Admin approve/reject choice could reach the server as the wrong value.
3. Phone field cleared after a wrong password.
4. Shop image storage key was rejected by the key pattern.

## Changes in this final batch
- Users can edit their display name (audited, integration-tested).
- `POST /api/internal/jobs/all` runs every periodic job once (isolated failures) so the host needs one scheduled call.
- Dead-button scan: every `<Button>` in a form now has an explicit type; no other inert buttons found.

## NOT tested (waiting for real keys or you)
Real Resend delivery · real R2 upload/retrieval/privacy · real Turnstile · TOTP with a real authenticator app · the scheduler on the real host · real manual-transfer money flow · real phone/RTL check. Steps: `docs/PRODUCTION-CHECKLIST.md` §5 and `docs/REAL-TESTS.md`.

## Business rules checked against the code
Order start = 2 stars (setting default) · commission 8% regular / 5% Premium (seed) · Plus 30 EGP / Premium 60 EGP, 30 days (plan defaults) · offers and contest OFF by default · payment manual with admin review, no gateway. No rule was changed.

## Dependabot #4–#7 (left open on purpose, all major upgrades)
#4 Prisma 7 fails to generate with the current schema · #5 eslint-config-next 16 crashes lint · #6 @types/node 26 passes but runtime is Node 22 · #7 eslint 10 conflicts with eslint-config-next 15. Details in `docs/DEPENDENCIES.md`. No known high/critical vulnerability is open (audit passed).

## Known gaps (need your decision, not a code fix)
- Admin mass/manual notifications to users: not built (needs your decision).
- Admin cannot create merchant/driver accounts or edit another user's profile from the dashboard.
- Notifications refresh by polling every 20 s, not instant push.
- Legal pages and support contact details: unapproved / empty by your instruction.
