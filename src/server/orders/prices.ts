import "server-only";
import { db } from "@/lib/db";
import { resolveOfferDiscounts } from "@/server/offers/service";

/** What each product costs right now for ONE unit (after any running offer). Used to refresh a stale cart; the order itself is always priced inside its own transaction. */
export async function currentUnitPrices(productIds: readonly string[]): Promise<Record<string, number>> {
  const ids = [...new Set(productIds)].slice(0, 60);
  const rows = await db.product.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, priceCents: true } });
  const discounts = await resolveOfferDiscounts(db, rows, new Date());
  return Object.fromEntries(rows.map((r) => [r.id, r.priceCents - (discounts.get(r.id)?.unitDiscountCents ?? 0)]));
}
