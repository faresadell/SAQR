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
| `OTP_PROVIDER` | `http` in production (console is refused). Needs `SMS_API_URL` (https), `SMS_API_TOKEN`, optional `SMS_SENDER`. Requires a signed contract with a real SMS gateway; request shape in `src/lib/sms/http-sms.ts` must match that gateway. |
| uploads directory | persistent volume OUTSIDE the web root (receipts, product images) |

## Scheduled jobs (call with `Authorization: Bearer $CRON_SECRET`)
`POST /api/internal/jobs/{daily-stars | monthly-rewards | plan-reminders | refund-overdue | membership-maintenance | settlements}` — daily is enough for all; `settlements` and `monthly-rewards` act only on the Cairo month boundary.

## First-run admin tasks
1. Create the main administrator and enrol TOTP.
2. Admin → payment methods: set the Vodafone Cash / InstaPay receiver numbers (until set, the method refuses payment requests).
3. Admin → zones: create delivery zones and fees. Review plans, membership plans, commissions and settings.

## Not provided yet (blocks launch or needs a decision)
- Real SMS gateway account (OTP / password reset cannot reach users without it).
- Push notifications provider (in-app notifications only).
- Object storage adapter (S3/R2) if the host has no persistent disk.
- Undecided business rules: offer discount rules/limits, contest ranking/eligibility/ties, Plus membership benefits, commission payment details, terms/support text, admin account recovery.
