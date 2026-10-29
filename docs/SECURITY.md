# SAQR security baseline (Phase 0–1)

## Authentication
- Phone number is the identity. Egyptian mobiles only (010/011/012/015), normalized to E.164.
- Passwords hashed with scrypt (N=2^15, r=8, p=3), unique salt, constant-time compare, Unicode-normalized.
- Signup requires an SMS/WhatsApp one-time code. Codes: 6 digits from a CSPRNG, stored only as HMAC hashes bound to phone + purpose, single use, expire (default 5 min), limited attempts (default 5, counted atomically), resend cooldown, per-phone and per-IP hourly caps.
- Login: identical error and identical timing for unknown phone / wrong password; per-IP and per-phone rate limits; account lock after repeated failures (default 5 failures → 15 min).
- Administrators additionally need an authenticator-app code (RFC 6238). The seed is encrypted at rest (AES-256-GCM); a used code cannot be replayed. Admins are created only by a command-line script, never through the public site.

## Sessions
- 256-bit random token in an httpOnly, SameSite=Lax cookie (`__Host-` prefixed and Secure in production). Only the SHA-256 hash is stored.
- New token on every login (no fixation). Logout deletes the session server-side. Suspending a user deletes all their sessions; a suspended or unverified account is rejected even with a valid cookie.
- Admin sessions are shorter (default 12 h).

## Authorization
- Roles: customer, merchant, driver, admin. Admin sub-permissions are rows in `AdminPermission`; the main administrator holds all.
- Every page uses `requireUser / requireRole / requirePermission` and every server action re-checks. Wrong role returns 404 so admin routes are not revealed. UI hiding is never relied on.
- Nobody can suspend the main administrator or themselves; only the main administrator can act on other admins. All status changes are written to the audit log with a mandatory reason.

## Web
- Per-request nonce CSP, HSTS, no framing, nosniff, strict referrer policy, restricted permissions.
- Forms use Next.js Server Actions (POST only, built-in origin check) plus SameSite cookies.
- All input validated with zod on the server. No `dangerouslySetInnerHTML`, no `eval` (enforced by ESLint).

## Data
- Money is integer piasters. Star ledger, order events and audit log are append-only (database triggers in `prisma/manual/001_constraints_and_triggers.sql`); star balance cannot be negative (CHECK constraint).
- Secrets live only in environment variables (`.env` is git-ignored).

## Known limits (tracked)
- Rate limiter is best-effort under heavy concurrency; OTP attempt limits are exact.
- An attacker who knows a victim's phone can trigger temporary lockout (standard trade-off); limits are admin-tunable.
- Real SMS/WhatsApp delivery arrives in Phase 9. Until then production cannot send codes (the console sender is refused in production by design).
- IP-based limits only work when `TRUST_PROXY=true` behind a proxy that overwrites `X-Forwarded-For`.
- `/privacy` is starter text and needs legal review before launch.
