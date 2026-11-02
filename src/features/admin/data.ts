import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/lib/db";
import { listAuditLog } from "@/server/audit/read";
import { listComplaintsForAdmin } from "@/server/complaints/service";
import { getStandings, listAwards } from "@/server/contest/service";
import { listOffersForAdmin } from "@/server/offers/service";
import { listAllPlans, listPurchasesForReview } from "@/server/plans/service";
import { listRefunds } from "@/server/refunds/service";
import { failed, ready, unavailable, type Loaded } from "@/features/shared/loaded";
import { listOrdersForActor, merchantNames } from "@/features/shared/server-mappers";
import type { AdminOrderRow, AuditRow, ComplaintAdminRow, ComplaintsAdminData, ContestAdminData, OfferAdminRow, PackageAdminRow, PurchaseReviewRow, RefundReviewRow } from "./types";

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
async function userNames(ids: string[]): Promise<Map<string, { name: string; role: string }>> {
  const rows = ids.length ? await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, role: true } }) : [];
  return new Map(rows.map((u): [string, { name: string; role: string }] => [u.id, { name: u.name, role: u.role }]));
}

/** Pending plan purchases. The service checks `payments.review`. */
export async function loadPurchaseReviews(user: U): Promise<Loaded<PurchaseReviewRow[]>> {
  try {
    const rows = await listPurchasesForReview(user, "PENDING");
    const users = await userNames(rows.map((r) => r.userId));
    return ready(
      rows.map((r) => ({
        id: r.id,
        buyerName: users.get(r.userId)?.name ?? "مستخدم",
        buyerRole: users.get(r.userId)?.role ?? "",
        planName: r.plan.nameAr,
        priceCents: r.priceCentsSnap,
        stars: r.baseStarsSnap + r.bonusStarsSnap,
        method: r.method,
        referenceNo: r.referenceNo,
        flagged: r.flagged,
        flagReason: r.flagReason,
        createdAt: r.createdAt.toISOString(),
        receiptUploadId: r.receiptUploadId,
      })),
    );
  } catch {
    return failed("تعذر تحميل الطلبات. تأكد من صلاحية مراجعة المدفوعات.");
  }
}

export async function loadPackageAdmin(user: U): Promise<Loaded<PackageAdminRow[]>> {
  try {
    const plans = await listAllPlans(user);
    return ready(plans.map((p) => ({ code: p.code, audience: p.audience, name: p.nameAr, priceCents: p.priceCents, baseStars: p.baseStars, bonusStars: p.bonusStars, offerQuota: p.offerQuota, isActive: p.isActive })));
  } catch {
    return failed("تعذر تحميل الباقات. تأكد من الصلاحية.");
  }
}

/** Refunds awaiting action (refunds.verify) and, when the admin also has complaints.manage, the complaints. */
export async function loadComplaintsAdmin(user: U): Promise<Loaded<ComplaintsAdminData>> {
  try {
    const refunds = (await listRefunds(user)).filter((r) => r.status !== "COMPLETED");
    const proofUploads = refunds.length
      ? await db.receiptUpload.findMany({ where: { orderId: { in: refunds.map((r) => r.orderId) }, usedAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, orderId: true } })
      : [];
    const proofByOrder = new Map<string, string>();
    for (const u of proofUploads) if (u.orderId && !proofByOrder.has(u.orderId)) proofByOrder.set(u.orderId, u.id);
    let complaints: ComplaintAdminRow[] | null = null;
    try {
      const rows = await listComplaintsForAdmin(user);
      const orders = await db.order.findMany({ where: { id: { in: rows.map((c) => c.orderId) } }, select: { id: true, number: true } });
      const numbers = new Map(orders.map((o): [string, number] => [o.id, o.number]));
      complaints = rows.map((c) => ({ id: c.id, orderNumber: numbers.get(c.orderId) ?? null, subject: c.subject, details: c.details, status: c.status, adminResponse: c.adminResponse, createdAt: c.createdAt.toISOString() }));
    } catch {
      complaints = null; // no complaints.manage: show the refunds part only
    }
    return ready({
      complaints,
      refunds: refunds.map((r) => ({ id: r.id, orderNumber: r.order.number, amountCents: r.amountCents, status: r.status as RefundReviewRow["status"], dueAt: r.dueAt.toISOString(), isOverdue: r.isOverdue, hasProof: r.hasProof, proofUploadId: proofByOrder.get(r.orderId) ?? null, decisionNote: r.decisionNote })),
    });
  } catch {
    return failed("تعذر التحميل. تأكد من صلاحية التحقق من الاستردادات.");
  }
}

export async function loadAdminOffers(user: U): Promise<Loaded<OfferAdminRow[]>> {
  try {
    const rows = await listOffersForAdmin(user);
    return ready(
      rows.map((o) => ({
        id: o.id,
        title: o.title,
        merchantName: o.merchant.name,
        endsAt: o.endsAt.toISOString(),
        state: o.state,
        discountLabel: o.discountType && o.discountValue !== null ? (o.discountType === "PERCENT" ? `خصم ${o.discountValue / 100}%` : `خصم ${o.discountValue / 100} جنيه للوحدة`) : null,
        stopReason: o.stopReason,
      })),
    );
  } catch {
    return failed("تعذر تحميل العروض. تأكد من صلاحية إدارة العروض.");
  }
}

export async function loadContestAdmin(user: U, monthKey: string): Promise<Loaded<ContestAdminData | null>> {
  try {
    const view = await getStandings(user, monthKey, 20);
    if (!view) return ready(null);
    const awards = await listAwards(user, monthKey);
    const names = await userNames([...awards.map((a) => a.userId), ...view.excluded.map((e) => e.userId)]);
    return ready({
      monthKey,
      closed: view.closed,
      enabled: view.enabled,
      rulesApproved: view.rulesApproved,
      rules: view.rules,
      standings: view.standings.map((s) => ({ userId: s.userId, name: s.name, rank: s.rank, qualifyingOrders: s.qualifyingOrders, qualifyingSalesCents: s.qualifyingSalesCents })),
      excluded: view.excluded.map((e) => ({ userId: e.userId, reason: e.reason })),
      awards: awards.map((a) => ({ id: a.id, rank: a.rank, userName: names.get(a.userId)?.name ?? "مستخدم", prizeCents: a.prizeCents, status: a.status, basisNote: a.basisNote, paymentReference: a.paymentReference })),
    });
  } catch {
    return failed("تعذر تحميل المسابقة. تأكد من صلاحية إدارة المسابقة.");
  }
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
export async function loadAdminNotifications(_user: U): Promise<Loaded<never>> {
  return unavailable("admin.notifications");
}
export async function loadAdminBusinesses(_user: U): Promise<Loaded<never>> {
  return unavailable("admin.businesses");
}
