import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { failed, ready, unavailable, type Loaded } from "@/features/shared/loaded";
import { listOrdersForActor, mapNotifications, mapPackages, mapStars, merchantNames } from "@/features/shared/server-mappers";
import type { CurrentPackage, NotificationItem, PackageOption, PaymentInstruction, StarsOverview } from "@/features/shared/types";
import type { MerchantOffersData, MerchantOrderRow, MerchantReport } from "./types";

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


/**
 * Real orders for the signed-in shop (the service scopes them to the owner). Action buttons stay disabled:
 * the order actions exist only as REST routes, and this view does not call them yet.
 */
export async function loadMerchantOrders(user: U): Promise<Loaded<MerchantOrderRow[]>> {
  return load(async () => {
    const page = await listOrdersForActor(user, { limit: 50 });
    return page.items.map((o) => ({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((i) => ({ id: i.productId, name: i.nameSnapshot, quantity: i.quantity, unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents })),
      subtotalCents: o.subtotalCents,
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      deliveryStatus: o.deliveryStatus,
      allowed: { accept: false, reject: false, advance: false, confirmPayment: false },
    }));
  });
}
export async function loadMerchantOffers(_user: U): Promise<Loaded<MerchantOffersData>> {
  return unavailable("merchant.offers");
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
export async function loadMerchantReport(_user: U): Promise<Loaded<MerchantReport>> {
  return unavailable("merchant.reports");
}
export async function loadMerchantNotifications(user: U): Promise<Loaded<NotificationItem[]>> {
  return load(() => mapNotifications(user));
}
