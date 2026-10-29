# Orders API (v1) — contract for the frontend

Status: implemented in `src/app/api/v1/orders/**`. **Not yet run against a database** (see docs/PHASE4.md). Money is always an integer in piasters (100 = 1 EGP).

## Common rules
- Auth: the session cookie (same login as the web app). No cookie -> `401 {"error":{"code":"UNAUTHENTICATED"}}`.
- Every `POST` must send `Content-Type: application/json` and an `Origin` header equal to the app origin (browsers do this automatically for same-origin `fetch`). Otherwise `415 UNSUPPORTED_MEDIA_TYPE` / `403 BAD_ORIGIN`.
- Bodies are strict: unknown fields -> `422 VALIDATION_FAILED`. Max body 16 KB (`413`).
- Errors always look like `{"error":{"code":"...","message"?:"..."}}`. Resources you may not see answer `404 NOT_FOUND` (same as missing).
- Rate limits answer `429 RATE_LIMITED`.
- Responses are `Cache-Control: no-store`.

## Order model
A checkout creates one **parent order** and one **suborder per merchant**. Everything the user pays and sees lives on the suborder: its own items, fee, total, payment and status. A parent has no stored status; the UI derives it from its suborders (`src/lib/orders/status.ts deriveParentStatus`).

`orderStatus` flow: `AWAITING_PAYMENT -> AWAITING_MERCHANT_APPROVAL -> APPROVED -> PREPARING -> READY -> OUT_FOR_DELIVERY -> DELIVERED`; side exits `REJECTED` (merchant, before approval) and `CANCELLED`.
`paymentStatus`: `NOT_REQUIRED_YET -> AWAITING_MERCHANT_CONFIRMATION -> CONFIRMED` (or `REJECTED`, then the customer may resubmit).
Uploading a receipt never confirms payment. The shop owner confirms it; only then can the shop approve the order; stars are charged on approval.

## POST /api/v1/orders — checkout (CUSTOMER)
Request:
```json
{ "idempotencyKey": "k-2026-10-29-0001", "addressId": "cl...", "lines": [ { "productId": "cl...", "quantity": 2, "expectedUnitPriceCents": 5000 } ] }
```
- `idempotencyKey` 8–64 chars `[A-Za-z0-9_-]`; generate once per checkout attempt and reuse it on retry.
- `expectedUnitPriceCents` is the price the user saw; if it differs from the current price the checkout is refused (never repriced).
- Fees are computed on the server from the address zone and are copied into each suborder.

`201` (new) or `200` (same key replayed):
```json
{ "parentOrderId": "cl...", "suborderIds": ["cl...", "cl..."], "subtotalCents": 13000, "deliveryFeeCents": 4000, "totalCents": 17000, "replayed": false }
```
Errors (`error.code`; `productId`/`merchantId` included when relevant):
`422` INVALID_REQUEST, EMPTY_CART, TOO_MANY_LINES, INVALID_QUANTITY, PRODUCT_NOT_FOUND, ADDRESS_NOT_FOUND, ZONE_UNAVAILABLE · `403` ACCOUNT_NOT_ACTIVE, FORBIDDEN · `409` PRODUCT_UNAVAILABLE, PRICE_CHANGED, MERCHANT_UNAVAILABLE (closed / not approved / low stars), CUSTOMER_STARS_TOO_LOW, TRADING_NOT_CONFIGURED (admin has not set the merchant response window).
Customer needs at least `stars.min_balance_customer` stars (default 5).

## GET /api/v1/orders?cursor=&limit=&status=
Own suborders (customer) or own shop's suborders (merchant); admins with `orders.view` see all. `limit` 1–50 (default 20), newest first.
`200 { "items": [Order], "nextCursor": "cl..." | null }`.

## GET /api/v1/orders/{id}
`200 Order` | `404`.
```json
{ "id":"cl...","number":12,"parentOrderId":"cl...","merchantId":"cl...","orderStatus":"AWAITING_PAYMENT","paymentStatus":"NOT_REQUIRED_YET","refundStatus":"NONE","deliveryStatus":"NOT_STARTED",
  "subtotalCents":10000,"deliveryFeeCents":2000,"totalCents":12000,"addressSnap":{"line":"..."},"cancelReason":null,"createdAt":"...",
  "items":[{"productId":"cl...","nameSnapshot":"...","unitPriceCents":5000,"quantity":2,"lineTotalCents":10000}],
  "payments":[{"id":"cl...","method":"instapay","referenceNo":"...","amountCents":12000,"submittedAt":"...","confirmedAt":null,"rejectedReason":null}] }
```
The receipt storage key is never returned here.

## POST /api/v1/orders/{id}/{action}
All answer `200 {"ok":true}` on success. Common errors: `404` (not your order), `409 WRONG_STATE`, `409 CONFLICT` (a concurrent request won; reload and retry), `422 VALIDATION_FAILED|INVALID_REQUEST`.

| action | who | body | notes |
|---|---|---|---|
| `payment` | the order's customer | `{method, referenceNo, receiptKey}` | method must be enabled (`422 PAYMENT_METHOD_DISABLED`). `receiptKey` comes from the upload service (**not built yet**). Amount is the suborder total, set by the server. Only in `AWAITING_PAYMENT` with payment `NOT_REQUIRED_YET` or `REJECTED`. |
| `payment-confirm` | shop owner (or admin with `payments.review`) | `{}` | `409 DUPLICATE_TRANSFER` if the same method + reference was already confirmed on another order. Moves the order to `AWAITING_MERCHANT_APPROVAL`. |
| `payment-reject` | shop owner (or admin with `payments.review`) | `{reason}` | order stays `AWAITING_PAYMENT`; customer can resubmit. |
| `decision` | shop owner only | `{decision:"APPROVE"}` or `{decision:"REJECT", reason}` | needs payment `CONFIRMED` (`409 PAYMENT_NOT_CONFIRMED`). APPROVE charges `orders.stars_charge_per_party` (default 2) from the customer AND the merchant once (`409 INSUFFICIENT_STARS` if either side is below the minimum; nothing changes). REJECT opens a refund when money was confirmed. |
| `advance` | shop owner | `{to}` | `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED`, in order. (Driver-driven steps arrive with the delivery phase.) |
| `cancel` | customer (before approval only), shop owner, or admin with `payments.review` | `{reason}` | from `AWAITING_PAYMENT`, `AWAITING_MERCHANT_APPROVAL`, or `APPROVED`. After approval the exact stars charged go back to both sides once. If payment was confirmed a refund (merchant returns the money) is opened with a deadline (`refunds.deadline_hours`). |

## Not implemented yet (do not build UI against these)
Receipt upload and download, refund proof/verification endpoints, cancellation after `APPROVED` stages (`CANCELLATION_REQUESTED` flow), driver endpoints, plans/offers/memberships/contest endpoints, notifications.
