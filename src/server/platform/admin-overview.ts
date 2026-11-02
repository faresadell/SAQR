import "server-only";
import { db } from "@/lib/db";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/server/errors";

/** Read-only overview of every shop with its catalog size. Shop approval and suspension stay in the merchants review screen. Needs catalog.manage. */
export async function listBusinessesOverview(actor: Actor) {
  if (!hasPermission(actor, "catalog.manage")) throw new AuthorizationError();
  const shops = await db.merchant.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, status: true, tier: true, businessTypeRef: { select: { nameAr: true } }, owner: { select: { name: true, phone: true } }, createdAt: true },
  });
  const [total, available] = await Promise.all([
    db.product.groupBy({ by: ["merchantId"], where: { archivedAt: null }, _count: { _all: true } }),
    db.product.groupBy({ by: ["merchantId"], where: { archivedAt: null, isAvailable: true }, _count: { _all: true } }),
  ]);
  const totalBy = new Map(total.map((t) => [t.merchantId, t._count._all]));
  const availBy = new Map(available.map((t) => [t.merchantId, t._count._all]));
  return shops.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    tier: s.tier,
    businessType: s.businessTypeRef.nameAr,
    ownerName: s.owner.name,
    ownerPhone: s.owner.phone,
    createdAt: s.createdAt,
    products: totalBy.get(s.id) ?? 0,
    availableProducts: availBy.get(s.id) ?? 0,
  }));
}

/** How many system notifications of each kind went out in the last 30 days (they are created automatically by order, payment, plan and refund events). Needs settings.view. */
export async function notificationActivity(actor: Actor, now = new Date()) {
  if (!hasPermission(actor, "settings.view") && !hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db.notification.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { type: "desc" } } });
  return rows.map((r) => ({ type: r.type, count: r._count._all }));
}
