# Real tests before launch (Resend, R2, payment, delivery)

Nothing below has been run against real services by the build process. CI proves the code compiles and the automated tests pass; it does NOT prove an email arrived or a file reached R2. Tick each box yourself, in the real deployment, and do not launch until the "verify" lines are true.

**Secrets:** put every key ONLY in the deployment environment (the host's environment-variable settings). Never in GitHub, in a `.env` file that is committed, in logs, or in chat. If a key is ever pasted anywhere else, rotate it.

## 1. Email with Resend

Where to add (deployment environment variables): `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (an address on a domain you verified in Resend, for example `صقر <no-reply@your-domain>`). Optional: `RESEND_TEMPLATE_VERIFY_ID`, `RESEND_TEMPLATE_RESET_ID` (the published templates must define the variables `code`, `minutes`, `app_name`).

Before testing: in the Resend dashboard the sending domain shows **Verified** (SPF and DKIM records added at your DNS provider).

Steps (use a mailbox you control):
1. Sign in as a customer, open **الملف الشخصي** and add your email, press «إرسال رمز التأكيد».
   - Verify: a message arrives (check spam too) from your `EMAIL_FROM` address, with a 6-digit code.
   - Verify: in Resend → Logs the send shows **Delivered**.
2. Enter the code. Verify: the badge changes to «مؤكَّد».
3. Enter a wrong code three or four times. Verify: it is refused and eventually rate-limited (no unlimited guessing).
4. Sign out, open **نسيت كلمة المرور؟**, type the confirmed email. Verify: a reset code arrives; use it to set a new password; the old password no longer works and other signed-in devices are signed out.
5. Type an email that has NO account. Verify: the screen answers exactly the same way (no "not found") and no message is sent.
6. Check the application logs for the send. Verify: they contain no API key and no full code.

If a send fails: the screen says it could not send; the code is not valid for use. Look at the Resend log for the reason (unverified domain, wrong `EMAIL_FROM`, key without send permission).

Phone (SMS) codes need a separate SMS provider that is not configured yet. Until then, password reset by phone cannot deliver codes; email is the working route for users who confirmed an address.

## 2. Storage with Cloudflare R2

Where to add: `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID` (32 hex characters), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Create the API token with Object Read & Write on that ONE bucket only.

Before testing: the bucket is **private** (no public access, no custom domain attached).

Steps:
1. As a customer, place an order and upload a transfer receipt (JPG/PNG/WebP under 5 MB).
   - Verify: the upload succeeds and the object appears in the R2 bucket under `receipts/…`.
2. As the shop owner of that order, open the order and press «عرض الإيصال». Verify: the image opens.
3. As a different customer or a different shop, request the same receipt link (`/api/v1/receipts/<id>`). Verify: you get "not found".
4. Try the object's direct R2 URL in a private window. Verify: it is NOT reachable.
5. Upload a non-image (rename a PDF to .jpg). Verify: it is refused.
6. Verify in the logs: no access keys, no signed URLs.

## 3. Money flow (manual transfer) end to end

Prerequisite: the administrator enters the receiving number in **الإعدادات ← طرق الدفع** (it is never in the code) and enables the method.
1. Customer buys from two shops in one checkout → two independent sub-orders appear.
2. Customer uploads a receipt for each → each shop confirms its own transfer → each accepts → stars are charged only after acceptance.
3. Shop prepares, assigns its own driver; driver picks up, delivers and records the delivery fee collected in cash.
4. Cancel one order after acceptance (customer asks, shop accepts) → stars come back on both sides and a refund record is opened for a confirmed transfer.
5. Admin confirms the refund proof.
6. Plan purchase: a customer, a merchant and a driver each send a purchase with receipt → admin approves → stars and subscription appear once (approve twice → second is refused).

## 4. Before opening offers and the contest

- Offers: open **الإعدادات ← العروض والخصومات**, review the limits (30% / 100 جنيه / 3 offers), then set "تفعيل الخصومات" to 1. Place an order on a discounted product and check that the order keeps the discount after the offer ends.
- Contest: review and approve the "contest" text under **الصفحات القانونية**, then set `contest.enabled` to 1.
- Legal pages: every page shows «مسودة غير معتمدة» until you approve a version. Review and approve them yourself.

## 5. Admin account safety

1. Sign in as admin → **أمان حسابي** → generate recovery codes → save them offline.
2. In a private window, sign in with a recovery code instead of the authenticator code. Verify: it works once, and the same code is refused the second time.
