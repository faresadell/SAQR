# SAQR — Production launch checklist

Do the steps in order. A green CI is **not** a launch approval: section 5 must be ticked by you on the real deployment.
Every secret goes ONLY in the host's environment settings. Never in GitHub, a committed file, logs or chat.

## 1. Accounts and domain (owner)
- [ ] Buy the domain; point it to the host over https.
- [ ] Resend: add the domain, add the DNS records Resend shows, wait for "Verified". Create an API key (send only).
- [ ] Cloudflare R2: create ONE private bucket (no public URL, no custom domain). Create an API token with Object Read & Write on that bucket only.
- [ ] Cloudflare Turnstile: create a widget for the domain (site key + secret key).
- [ ] PostgreSQL 16 (managed): create the production database.

## 2. Environment variables (host settings)
Full table and notes: `docs/DEPLOYMENT.md`. Summary:
`DATABASE_URL`, `APP_URL`, `SESSION_SECRET` (≥32 random), `DATA_ENCRYPTION_KEY` (base64 of 32 random bytes), `CRON_SECRET` (≥32 random), `TRUST_PROXY=true` (only behind a proxy), `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`, `OTP_PROVIDER=disabled`, `CAPTCHA_PROVIDER=turnstile` + `TURNSTILE_SECRET_KEY` + `TURNSTILE_SITE_KEY`, `STORAGE_PROVIDER=r2` + `R2_ACCOUNT_ID` + `R2_BUCKET` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`.
The app refuses to start in production with the console email sender or a disabled robot check.

## 3. Deploy
- [ ] Node 22 runtime. `npm ci && npm run build`.
- [ ] `npx prisma migrate deploy` (never `db push` / `migrate dev`). Then `npm run db:seed` once (commission rates 8% / 5%, payment methods, plans, business types).
- [ ] Create the main admin: `ADMIN_PASSWORD='…12+ chars…' npm run admin:create -- --phone 01XXXXXXXXX --name "…"`. Add the printed key to an authenticator app immediately (shown once). Save the recovery codes offline.
- [ ] Scheduler: one call hourly (daily is enough): `POST https://<domain>/api/internal/jobs/all` with header `Authorization: Bearer <CRON_SECRET>`. Expect HTTP 200 and a JSON result per job.

## 4. First-run admin setup (from `/admin`)
- [ ] Payment methods: set the real Vodafone Cash / InstaPay receiving numbers and enable them.
- [ ] Delivery zones and fees; categories/business types; add the first shops (owner chosen from merchant accounts).
- [ ] Support contact details and the legal pages: these stay **unapproved** until you review and approve them. No placeholder support data is shown.
- [ ] Offers/discounts and the contest stay OFF until you approve their rules.

## 5. Real tests on the real deployment (tick each yourself)
The full step-by-step list is in `docs/REAL-TESTS.md` section B. Minimum before selling:
- [ ] Sign-up email really arrives (customer, merchant, driver) and activation opens the right dashboard.
- [ ] Password-reset email arrives; unknown address gets the same screen and no email.
- [ ] Turnstile widget shows on sign-up; a missing/wrong token is refused.
- [ ] Admin login with the real authenticator code; one recovery code works once.
- [ ] R2: upload a product picture and a receipt; the right people see them; another customer gets "not found"; the bucket URL is not reachable directly.
- [ ] One full manual-payment order with the real receiving number: buy stars → admin approves → order → receipt → shop confirms → driver delivers.
- [ ] Two real drivers on `/driver/board`: one accepts, the other is told who won.
- [ ] Scheduler call returns 200.
- [ ] Phone check on a real phone: RTL layout, bottom bar, logout from the menu.

## 6. Go / no-go
Launch only when sections 1–5 are fully ticked, the legal pages are approved by you, and support contact details are entered.
