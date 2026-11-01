import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/lib/db";
import { listAuditLog } from "@/server/audit/read";
import { failed, ready, unavailable, type Loaded } from "@/features/shared/loaded";
import { listOrdersForActor, merchantNames } from "@/features/shared/server-mappers";
import type { ReceiptReviewRow } from "@/features/shared/types";
import type { AdminOrderRow, AuditRow, ComplaintRow, PackageAdminRow } from "./types";

/**
 * Admin loaders without server support yet. HOOK-UP POINT for the backend developer. Each page already calls
 * `requirePermission(...)`; the loader MUST also check the permission inside its service (never trust the page).
 * Existing admin screens (users, merchants, catalog, settings) call their services directly and are not listed here.
 */
type U = SessionUser["user"];

/** The service itself checks `orders.view`; a non-admin gets no rows. */
export async function loadAdminOrders(user: U): Promise<Loaded<AdminOrderRow[]>> {
  try {
    const page = await listOrdersForActor(user, { limit: 50 });
    const names = await merchantNames(page.items.map((o) => o.merchantId));
    const customers = await db.order.findMany({ where: { id: { in: page.items.map((o) => o.id) } }, select: { id: true, customer: { select: { name: true } } } });
    const customerName = new Map<string, string>(customers.map((c): [string, string] => [c.id, c.customer.name]));
    return ready(
      page.items.map((o) => ({
        id: o.id,
        number: o.number,
        createdAt: o.createdAt.toISOString(),
        customerName: customerName.get(o.id) ?? "عميل",
        merchantName: names.get(o.merchantId) ?? "نشاط",
        totalCents: o.totalCents,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        deliveryStatus: o.deliveryStatus,
      })),
    );
  } catch {
    return failed("تعذر تحميل الطلبات. حاول مرة أخرى.");
  }
}
export async function loadReceiptReviews(_user: U): Promise<Loaded<ReceiptReviewRow[]>> {
  return unavailable("admin.payments");
}
export async function loadPackageAdmin(_user: U): Promise<Loaded<PackageAdminRow[]>> {
  return unavailable("admin.packages");
}
export async function loadComplaints(_user: U): Promise<Loaded<ComplaintRow[]>> {
  return unavailable("admin.complaints");
}
/** The service checks `audit.view`; an admin without it gets an error state, never rows. */
export async function loadAudit(user: U): Promise<Loaded<AuditRow[]>> {
  try {
    const page = await listAuditLog(user, { limit: 100 });
    const ids = [...new Set(page.items.map((r) => r.actorId).filter((x): x is string => !!x))];
    const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map<string, string>(users.map((u): [string, string] => [u.id, u.name]));
    return ready(page.items.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), actorName: r.actorId ? (names.get(r.actorId) ?? "مستخدم") : "النظام", action: r.action, entityType: r.entityType, entityId: r.entityId })));
  } catch {
    return failed("تعذر تحميل السجل. تأكد من صلاحية عرض سجل العمليات.");
  }
}
export async function loadAdminOffers(_user: U): Promise<Loaded<never>> {
  return unavailable("admin.offers");
}
export async function loadAdminNotifications(_user: U): Promise<Loaded<never>> {
  return unavailable("admin.notifications");
}
export async function loadAdminBusinesses(_user: U): Promise<Loaded<never>> {
  return unavailable("admin.businesses");
}
