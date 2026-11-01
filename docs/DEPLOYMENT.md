# SAQR — Deployment checklist

## Required environment
| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL 16. Apply schema with `npx prisma migrate deploy` ONLY (never `db push`). See docs/MIGRATIONS.md; a DB created earlier with `db push` must not receive the baseline. |
| `APP_URL` | public https URL (Origin checks) |
| `SESSION_SECRET` | ≥ 32 random chars (also keys OTP hashes) |
| `DATA_ENCRYPTION_KEY` | base64 of 32 random bytes |
| `CRON_SECRET` | protects `/api/internal/jobs/*` |
| `TRUST_PROXY` | `true` only behind a proxy that sets the client IP |
| `EMAIL_PROVIDER` | `resend` in production (console is refused). Needs `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain VERIFIED in Resend, e.g. `صقر <no-reply@your-domain>`). Optional `RESEND_TEMPLATE_VERIFY_ID` / `RESEND_TEMPLATE_RESET_ID`: the published template must define the variables `code`, `minutes`, `app_name`. Not production-ready until a real send succeeds (see "Real-send test" below). |
| `OTP_PROVIDER` | SMS is not used for now. Keep `disabled` in production (`console` is refused); `http` exists only for a future gateway. |
| `STORAGE_PROVIDER` | `r2` for Cloudflare R2 (needs `R2_ACCOUNT_ID` (32 hex), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` with Object Read & Write on that one bucket only). The bucket must stay PRIVATE: no public bucket URL and no custom domain; every file is served through our own authorised routes. Default `local` needs a persistent volume. |
| `UPLOAD_DIR` | only with `STORAGE_PROVIDER=local`: persistent volume OUTSIDE the web root |

## Scheduled jobs (call with `Authorization: Bearer $CRON_SECRET`)
`POST /api/internal/jobs/{daily-stars | monthly-rewards | plan-reminders | refund-overdue | membership-maintenance | settlements}` — daily is enough for all; `settlements` and `monthly-rewards` act only on the Cairo month boundary.

## First-run admin tasks
1. Create the main administrator and enrol TOTP.
2. Admin → payment methods: set the Vodafone Cash / InstaPay receiver numbers (until set, the method refuses payment requests).
3. Admin → zones: create delivery zones and fees. Review plans, membership plans, commissions and settings.

## Real-send test (do once, with real accounts)
1. Resend: verify the domain (DNS records), set the variables, sign in, add an email on a test account (`POST /api/v1/account/email`), confirm the code arrives and `/confirm` accepts it; then run a password reset by email. Only after both succeed is email considered ready.
2. R2: set the variables, upload a product image and a payment receipt, confirm they open through the app and that the bucket URL itself is NOT publicly readable. The R2 adapter is unit-tested against the AWS signature test vector but has NOT been run against a real bucket.

## Administrator recovery
- Each administrator creates 10 single-use backup codes (`POST /api/v1/admin/recovery-codes`) and stores them offline. A code replaces the authenticator code at login, once.
- If codes are lost too: the SYSTEM OWNER (someone with database + `DATA_ENCRYPTION_KEY` access, verified out-of-band by the main administrator) runs `npm run admin:reset-totp -- --phone 01XXXXXXXXX --reason "..." --confirm-phone 01XXXXXXXXX`. It revokes all sessions, voids old codes, issues a new authenticator secret (printed once) and writes an audit entry. Email alone can never bypass the authenticator.

## Money rules that need the owner
- Automatic payment (stars, plans) is NOT available until a payment gateway is contracted: see docs/PAYMENT-GATEWAYS.md. Manual transfer with proof and admin review stays. Enter the receiving number from the admin panel (never in code or GitHub).
- Discounts (`offers.discount.*`) and the contest (`contest.*`) are OFF by default. The suggested limits (30% / 100 EGP per unit / 3 offers per shop) need the owner's approval before enabling in production.

## Not provided yet (blocks launch or needs a decision)
- Resend domain/template verification and a real send test; R2 bucket and keys.
- Payment gateway contract (optional for launch because manual transfer works).
- Push notifications provider (in-app notifications only).
- Legal review and approval of the five legal pages and the contest rules page (they ship as drafts).
- Official support phone/email (not invented; added from the admin panel after approval).
