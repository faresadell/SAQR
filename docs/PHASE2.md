# Phase 2: Platform settings (admin) — what exists and what is undecided

## What exists
- **Dashboard page** `/admin/settings` (needs `settings.view` to see, `settings.manage` to change). Every control calls a server action → service → PostgreSQL; the page reads back from the same services.
- **Operational settings** (`src/lib/settings-registry.ts`): stars charged per party per order (default 5), minimum star balance for customer / merchant (default 5), refund deadline (default 24 h, can only be shortened: max 24), merchant response window (NOT SET until the business decides), plus the security limits from Phase 1. Stored as dated versions in `PlatformSettingVersion`; each save writes an audit row (admin, old value, new value, effective date).
- **Commissions** (`CommissionRate`): Basic (`REGULAR`) 8%, Premium (`BUSINESS`) 5%, effective-dated, append-only. `buildCommissionSnapshot()` returns the rate, the base and the commission to copy into an order's financial record (`merchantTierSnap`, `commissionBp`, `commissionBaseCents`, `commissionCents`). Rates apply to the merchant's tier; they are not a customer fee.
- **Payment methods** (`PaymentMethodConfig`): Vodafone Cash and InstaPay, enable/disable. Seeded DISABLED: an admin must enable them. No account numbers or secrets are stored here. `getEnabledPaymentMethods()` / `assertPaymentMethodEnabled()` are the server-side gates the checkout (Phase 6) must call.
- **Delivery zones and fees** (`DeliveryZone`, `DeliveryFeeVersion`): create zones, schedule fee changes (dated), deactivate (never delete). `resolveZoneFee()` is the quote the checkout copies into the order.
- **Receipt access policy** `canViewReceipt()` (customer of the order, owning merchant, admins with `payments.review`; nobody else). The download endpoint (Phase 6) must call it.
- **Database guarantees** `prisma/manual/002_phase2_append_only.sql`: settings versions, commission rates, fee versions and audit rows cannot be edited or deleted; commission rate range CHECK.

## How "old calculations never change" is guaranteed
1. An order stores the tier, rate, base and commission amount at creation. Later rate or membership changes never rewrite those columns.
2. Rates are effective-dated; a new rate cannot take effect in the past (max 365 days ahead).
3. Rate rows are append-only (database triggers). A mistake is corrected by adding a newer row for the same start date; nothing is edited.
4. Delivery fees follow the same dated-version rule and are copied into the order.

## Decisions NOT made (needs the business owner)
1. **Commission base when discounts exist.** Agreed: eligible product value, excluding delivery. Not decided: whether a discount reduces the base, and whether it matters who funds it (merchant, platform, shared). Phase 2 stores the base it used; the rule is applied when discounts arrive (Phase 12).
2. **Commission after partial refunds.** The master specification says commission follows the value the merchant keeps. Adjustments and settlement credits are Phase 7 / 11. The stored commission is provisional until then.
3. **Tier naming.** This phase calls the tiers Basic (8%) and Premium (5%). The master specification called the merchant tier "Business" (99 EGP/month). The database enum is still `REGULAR` / `BUSINESS`. Please confirm Premium = Business.
4. **Merchant response window.** No value given, so none is assumed. Orders must not be opened for trading until it is set.
5. **"Maximum stars per order: 5".** Implemented as "stars charged from each party per order = 5" (editable, 0–50) and separate minimum balances (5 each). If you meant a hard ceiling, say so.
6. **Merchant tier changes are not audited yet.** Membership assignment arrives with merchants (Phase 3) and memberships (Phase 12); orders are safe either way because they snapshot the tier.
7. **Payment account numbers.** Where merchants publish the number customers pay to is Phase 3 (merchant profile), not here.

## Known limits
- Each setting is saved in its own transaction. The form validates every field first, so a bad value saves nothing, but a failure between two valid saves (for example a database outage) could leave a partial save. Each saved item is still individually audited.
- Setting values are cached up to 30 s per server instance.
- Fees are per zone (name + fee). Polygon / distance-band rules are future work.
- Time inputs are Cairo time and converted before saving.
