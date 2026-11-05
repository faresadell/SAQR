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
| `OTP_PROVIDER` | SMS is not used: accounts are activated by the code emailed to the user. Keep `disabled` in production (`console` is refused); `http` exists only for a future gateway. |
| `CAPTCHA_PROVIDER` | `turnstile` in production (`disabled` is refused). Needs `TURNSTILE_SECRET_KEY` (secret, environment only) and `TURNSTILE_SITE_KEY` (public) from a free Cloudflare Turnstile widget for your domain. The sign-up page shows the "not a robot" check and the server verifies it; no account is created without it. |
| `STORAGE_PROVIDER` | `r2` for Cloudflare R2 (needs `R2_ACCOUNT_ID` (32 hex), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` with Object Read & Write on that one bucket only). The bucket must stay PRIVATE: no public bucket URL and no custom domain; every file is served through our own authorised routes. Default `local` needs a persistent volume. |
| `UPLOAD_DIR` | only with `STORAGE_PROVIDER=local`: persistent volume OUTSIDE the web root |

## Scheduled jobs (call with `Authorization: Bearer $CRON_SECRET`)
`POST /api/internal/jobs/{daily-stars | monthly-rewards | plan-reminders | refund-overdue | membership-maintenance | settlements}` — or just `POST /api/internal/jobs/all` (runs every job once; a failing job does not stop the others; all are idempotent). Schedule that ONE call hourly with your host's scheduler (or any cron service) sending the `Authorization` header. Daily is enough; `settlements` and `monthly-rewards` act only on the Cairo month boundary.

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

## Vercel notes
- Set every variable from the table above in Vercel > Project > Settings > Environment Variables (Production), then **redeploy** (variables apply only to new deployments).
- The `vercel-build` script does the database work for you on every PRODUCTION deploy: `prisma migrate deploy` (creates/updates the tables) then the idempotent seed (commission rates, payment methods, plans, business types; receiving numbers from `VODAFONE_CASH_RECEIVER` / `INSTAPAY_RECEIVER` if set), then `next build`. The app uses `DATABASE_URL` at runtime; the migration step uses `DATABASE_URL_UNPOOLED` when present (Vercel's Neon integration sets both), otherwise `DATABASE_URL`. Preview deployments of other branches skip this step. If `DATABASE_URL` is not set the step is skipped with a warning (the site still builds and `/api/health` reports the problem); if it IS set and the migration fails, the build fails on purpose so a broken database is never deployed.
- **Trial before you own a domain:** set `PREVIEW_MODE=true` and `APP_URL=https://<your-app>.vercel.app`. Sign-up codes are then printed in Vercel > Logs (search "DEV ONLY") instead of emailed, and the robot check may stay off. The app REFUSES `PREVIEW_MODE` on any address that is not `*.vercel.app`, so it can never run on the real domain. Remove `PREVIEW_MODE` when you switch to the real domain and Resend. Uploads (pictures, receipts) need R2 even in the trial: Vercel has no persistent disk. R2 and Turnstile work on the `vercel.app` address too.
- The main admin can be created from a phone: set `SETUP_TOKEN` (32+ random characters), redeploy, open `/setup` (it shows the authenticator key once; a 404 when the token is unset or an admin exists), then remove `SETUP_TOKEN`. Or by one command from your computer (it prints the authenticator key once, so it must never run inside a build log): `ADMIN_PASSWORD='…' npm run admin:create -- --phone 01XXXXXXXXX --name "…"` with the production `DATABASE_URL` and `DATA_ENCRYPTION_KEY`.
- Check the deployment: open `https://<your-app>/api/health`. `{"ok":true}` = configured. `{"ok":false,"problem":"ENV"}` = a variable is missing or invalid (the exact names are in Vercel > Logs, search "health:"). `"DATABASE"` = cannot connect (wrong URL, or the provider blocks Vercel). `"MIGRATIONS"` = connected but the tables do not exist yet (run `migrate deploy`).
- The generic "حدث خطأ غير متوقع" page means a server error; the real message is in Vercel > Logs.
