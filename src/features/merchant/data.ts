import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/lib/db";
import { cairoMonthKey } from "@/lib/stars/rules";
import { merchantSalesReport } from "@/server/reports/service";
import { failed, ready, unavailable, type Loaded } from "@/features/shared/loaded";
import { listOrdersForActor, mapNotifications, mapPackages, mapStars } from "@/features/shared/server-mappers";
import type { CurrentPackage, NotificationItem, PackageOption, PaymentInstruction, StarsOverview } from "@/features/shared/types";
import { getSetting } from "@/lib/settings";
import { listOwnProducts } from "@/server/catalog/products";
import { listMyOffers } from "@/server/offers/service";
import { listMyDrivers } from "@/server/drivers/service";
import type { MerchantDriverOption, MerchantOffersData, MerchantOrderActions, MerchantOrderRow, MerchantReport } from "./types";

/**
 * Merchant loaders for screens with no server support yet. HOOK-UP POINT for the backend developer:
 * replace each `unavailable(...)` with a mapped `ready(...)`. Read only the signed-in merchant's own data.
 * (Shop profile and products already use the existing services directly in their pages.)
 */
type U = SessionUser["user"];

async function load<T>(work: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return ready(await work());
  } catch {
    return failed("تعذر تحميل البيانات. حاول مرة أخرى.");
  }
}


const NEXT_STEP: Record<string, MerchantOrderActions["advanceTo"]> = { APPROVED: "PREPARING", PREPARING: "READY", READY: "OUT_FOR_DELIVERY", OUT_FOR_DELIVERY: "DELIVERED" };
const DRIVER_ON_THE_WAY = ["DRIVER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];
const REASSIGNABLE = ["NOT_STARTED", "AWAITING_DRIVER", "DRIVER_ASSIGNED", "FAILED"];

export function merchantActionsFor(o: { orderStatus: string; paymentStatus: string; deliveryStatus: string }): MerchantOrderActions {
  const awaitingTransfer = o.orderStatus === "AWAITING_PAYMENT" && o.paymentStatus === "AWAITING_MERCHANT_CONFIRMATION";
  const advanceTo = NEXT_STEP[o.orderStatus] ?? null;
  return {
    confirmPayment: awaitingTransfer,
    rejectPayment: awaitingTransfer,
    approve: o.orderStatus === "AWAITING_MERCHANT_APPROVAL" && o.paymentStatus === "CONFIRMED",
    reject: o.orderStatus === "AWAITING_MERCHANT_APPROVAL" && o.paymentStatus === "CONFIRMED",
    // With a driver on the way, the driver confirms pickup and delivery; the shop cannot skip that.
    advanceTo: advanceTo && !((advanceTo === "OUT_FOR_DELIVERY" || advanceTo === "DELIVERED") && DRIVER_ON_THE_WAY.includes(o.deliveryStatus)) ? advanceTo : null,
    assignDriver: ["APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(o.orderStatus) && o.paymentStatus === "CONFIRMED" && REASSIGNABLE.includes(o.deliveryStatus),
    cancel: o.orderStatus === "APPROVED",
    resolveCancellation: o.orderStatus === "CANCELLATION_REQUESTED",
  };
}

/** Real orders for the signed-in shop (the service scopes them to the owner), with the actions the shop may use now. */
export async function loadMerchantOrders(user: U): Promise<Loaded<MerchantOrderRow[]>> {
  return load(async () => {
    const page = await listOrdersForActor(user, { limit: 50 });
    const ids = page.items.map((o) => o.id);
    const [uploads, customers] = await Promise.all([
      db.receiptUpload.findMany({ where: { orderId: { in: ids }, usedAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, orderId: true } }),
      db.order.findMany({ where: { id: { in: ids } }, select: { id: true, customer: { select: { name: true } } } }),
    ]);
    const uploadByOrder = new Map<string, string>();
    for (const u of uploads) if (u.orderId && !uploadByOrder.has(u.orderId)) uploadByOrder.set(u.orderId, u.id);
    const nameByOrder = new Map(customers.map((c) => [c.id, c.customer.name]));
    return page.items.map((o) => {
      const pay = o.payments[0];
      const receiptUploadId = uploadByOrder.get(o.id);
      return {
        id: o.id,
        number: o.number,
        createdAt: o.createdAt.toISOString(),
        items: o.items.map((i) => ({ id: i.productId ?? `${o.id}:${i.nameSnapshot}`, name: i.nameSnapshot, quantity: i.quantity, unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents })),
        subtotalCents: o.subtotalCents,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        deliveryStatus: o.deliveryStatus,
        ...(nameByOrder.get(o.id) ? { customerName: nameByOrder.get(o.id)! } : {}),
        ...(pay ? { payment: { methodLabel: pay.method, amountCents: pay.amountCents, ...(pay.referenceNo ? { referenceNo: pay.referenceNo } : {}), ...(receiptUploadId ? { receiptUploadId } : {}), ...(pay.rejectedReason ? { rejectedReason: pay.rejectedReason } : {}) } } : {}),
        actions: merchantActionsFor(o),
      };
    });
  });
}

export async function loadMerchantDriverOptions(user: U): Promise<MerchantDriverOption[]> {
  return (await listMyDrivers(user)).filter((d) => d.isActive && d.accountStatus === "ACTIVE").map((d) => ({ id: d.id, name: d.name }));
}

export async function loadMerchantOffers(user: U): Promise<Loaded<MerchantOffersData>> {
  return load(async () => {
    const [offers, products, enabled, maxPercent, maxFixedEgp, maxActive, baseHours, perHour] = await Promise.all([
      listMyOffers(user),
      listOwnProducts(user),
      getSetting("offers.discount.enabled"),
      getSetting("offers.discount.max_percent"),
      getSetting("offers.discount.max_fixed_egp"),
      getSetting("offers.discount.max_active_per_shop"),
      getSetting("offers.base_duration_hours"),
      getSetting("offers.extension_stars_per_hour"),
    ]);
    return {
      discounts: { enabled: enabled === 1, maxPercent, maxFixedEgp, maxActive },
      baseHours,
      extensionStarsPerHour: perHour,
      offers: offers.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        startsAt: o.startsAt.toISOString(),
        endsAt: o.endsAt.toISOString(),
        state: o.state,
        discountLabel: o.discountType && o.discountValue !== null ? (o.discountType === "PERCENT" ? `خصم ${o.discountValue / 100}%` : `خصم ${o.discountValue / 100} جنيه للوحدة`) : null,
      })),
      products: products.filter((p) => p.isAvailable).map((p) => ({ id: p.id, name: p.nameAr, priceCents: p.priceCents })),
    };
  });
}
export interface MerchantPackagesData {
  options: PackageOption[];
  current: CurrentPackage;
  instructions: PaymentInstruction[];
  stars: StarsOverview;
}
export async function loadMerchantPackages(user: U): Promise<Loaded<MerchantPackagesData>> {
  return load(async () => {
    const [pkg, stars] = await Promise.all([mapPackages(user), mapStars(user)]);
    return { ...pkg, stars };
  });
}
/** Real numbers: this month's sales/commission (Cairo month), the last six months for the chart, and the latest delivered orders. */
export async function loadMerchantReport(user: U): Promise<Loaded<MerchantReport>> {
  return load(async () => {
    const now = new Date();
    const keys: string[] = [];
    for (let back = 5; back >= 0; back -= 1) keys.push(cairoMonthKey(new Date(now.getTime() - back * 30 * 86_400_000)));
    const months = [...new Set(keys)]; // consecutive 30-day probes can repeat a month near month ends
    const reports = await Promise.all(months.map((m) => merchantSalesReport(user, m)));
    const current = reports[reports.length - 1];
    const orders = await db.order.findMany({
      where: { merchant: { ownerId: user.id }, orderStatus: "DELIVERED" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { number: true, createdAt: true, subtotalCents: true, commissionBp: true, commissionCents: true },
    });
    return {
      periodLabel: months[months.length - 1]!,
      salesCents: current?.productSalesCents ?? 0,
      commissionCents: current?.commissionCents ?? 0,
      settlementCents: current?.netAfterCommissionCents ?? 0,
      monthly: months.map((label, i) => ({ label, value: reports[i]?.productSalesCents ?? 0 })),
      rows: orders.map((o) => ({ orderNumber: o.number, date: o.createdAt.toISOString().slice(0, 10), subtotalCents: o.subtotalCents, commissionBp: o.commissionBp, commissionCents: o.commissionCents })),
    };
  });
}
export async function loadMerchantNotifications(user: U): Promise<Loaded<NotificationItem[]>> {
  return load(() => mapNotifications(user));
}
