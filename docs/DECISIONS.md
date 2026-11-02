# Decisions needed from the owner (kept minimal)

## 1. `/admin/businesses` — read-only is what exists
It lists every shop with type, owner, status, product counts (available / total) and registration date so an admin can see the whole marketplace. The actions an admin really needs on a shop (approve, reject, suspend, change tier) already live in **`/admin/merchants`** and are audited. **Missing essential functions: none for launch.** Impact on launch: none.
Smallest optional step later: a link from each row to the shop's page in `/admin/merchants`. No schema change.

## 2. `/admin/notifications` — read-only counts is what exists
It shows how many automatic notifications (order, payment, settlement, …) were sent in the last 30 days. Customers/shops/drivers already get automatic in-app notifications. Impact on launch: none.

## 3. Admin takedown of a single product — recommendation: NOT before launch
- Need today: an admin can already suspend the whole shop (`/admin/merchants`) or the owner account, which removes all its products from sale. The shop owner can archive/hide a product.
- Needed only if you want to hide ONE product of a shop that refuses to. 
- Cost if built: one new column (`Product.hiddenByAdminAt` + reason), one migration, one permission (`catalog.manage`), an audit action, the public queries filtered by it, and a clear message to the shop. Security impact: small (new admin-only write, audited).
- Decision: **defer**, build only when a real case appears.

## 4. Manual broadcast notifications — recommendation: NOT before launch
- Need today: automatic notifications cover order, payment, refund, settlement and award events.
- A broadcast needs product decisions you have not made: who may send (which permission), to whom (all/role/shop), opt-out, volume limits, and the cost of email/SMS if used (in-app only is free).
- Cost if built (in-app only): a `Broadcast` table + one `notify` fan-out, one permission, audit, rate limit. Security impact: medium (mass messaging by one admin; phishing risk if an admin account is taken over).
- Decision: **defer**.

## 5. Offers and contest
Both stay OFF (`offers.discount.enabled = 0`, `contest.enabled = 0`). Suggested limits waiting for your approval: 30% maximum percent, 100 EGP maximum fixed discount per unit, 3 active discount offers per shop. The contest additionally needs the "contest" legal text approved. Contest defaults `min_order_subtotal_egp = 0` and `max_orders_per_shop_per_customer = 0` (no minimum / no per-shop limit): review them before enabling.

## 6. Dependabot #4–#7
Do not merge now (reasons in `docs/DEPENDENCIES.md`): #4 Prisma 7 and #5/#7 ESLint 10 + eslint-config-next 16 are migrations, not bumps; #6 @types/node 26 needs the runtime on Node 26.
