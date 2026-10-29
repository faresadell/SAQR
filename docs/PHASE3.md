# Phase 3: merchants and catalog — what exists and what is undecided

## What exists
- **Merchant registration**: a MERCHANT account fills a shop profile (name, business type, description, optional contact phone, address, location, weekly opening hours). It starts `PENDING_REVIEW` and is invisible to customers until an admin approves it.
- **Admin review** (`/admin/merchants`, needs `merchants.review`): approve, reject (reason required), suspend (reason required), reactivate, and change the membership tier (Basic/Premium, reason required). Every decision is audited. Legal moves are enforced by one state machine (`src/lib/catalog/merchant-status.ts`). A rejected shop sees the reason and can fix and resubmit.
- **Tier changes are audited and only affect FUTURE orders.** Orders snapshot tier, rate and commission when created (Phase 2), so old orders never change.
- **Categories** (`/admin/catalog`, needs `catalog.manage`): two levels (category, sub-category), create / rename / reorder (sort order) / hide / show / archive. Archived, never deleted. A category with live sub-categories cannot be archived. Hiding a category hides its products from customers.
- **Business types**: an editable list (restaurant, shop, ...), seeded with two and managed by admins. No code enum.
- **Products** (`/merchant`): the OWNER of an APPROVED shop can add, edit, change price and category, pause/resume availability, and archive. Prices are integer piasters (0.01 – 100,000 EGP, also a database CHECK). Archive keeps the row so historical orders stay valid.
- **Public catalog read services** (`src/server/catalog/public.ts`) for the Phase 4 browsing UI: approved shops only, non-archived products in visible categories only, public fields only, open/closed computed in Cairo time.

## Security properties
- The merchant a request acts on is derived from the signed-in session, never from a client-supplied id. Every product lookup includes the merchant id in the query, so another merchant's product id returns "not found" (IDOR-safe).
- Wrong-role access to `/merchant` or `/admin/*` is 404 (guards), and every server action re-checks on the server.
- Free text is trimmed, control characters removed, length-limited; output is escaped by React. Business type codes are restricted to `[a-z0-9_]`.
- All changes write an audit row inside the same transaction.

## Decisions NOT made (needs the business owner)
1. **One shop per owner.** Enforced by a unique key on the owner. If one person must run several shops, say so (it changes the schema and the login flow).
2. **Staff accounts for a shop** ("authorized staff" in the specification). Not built: only the owner manages the catalog. Needs your decision on staff roles and permissions.
3. **Product images.** Not built. They need an object-storage choice (S3-compatible, R2, MinIO...) and upload rules. `imageKey` stays empty for now; customer product photography is a Phase 4 dependency.
4. **No schedule = always open.** A shop whose hours were never saved is treated as always open. The form requires hours, so this only affects legacy rows. Confirm.
5. **Profile edits after approval are not re-reviewed.** A merchant can rename an approved shop. Say if sensitive fields (name, business type) should go back to review.
6. **Sub-categories by shop?** Categories are global (platform-wide). Per-shop menu sections are not built.
7. **Per-category extra product fields** (`fieldsSpec`) are not implemented; the column exists for later.
8. **Customer-side visibility of unavailable products**: they are returned flagged `isAvailable: false`. Phase 4 decides how to display them.

## Known limits
- Merchant notifications (approved / rejected) arrive with Phase 9; today the merchant sees the status on `/merchant`.
- Merchant search is by name only; richer search and filters arrive with the customer UI (Phase 4).
