import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { failed, ready, unavailable, type Loaded } from "@/features/shared/loaded";
import { mapCustomerOrder, mapCustomerOrders, mapNotifications, mapPackages, mapStars } from "@/features/shared/server-mappers";
import type {
  AddressItem,
  CurrentPackage,
  MainOrderView,
  NotificationItem,
  PackageOption,
  PaymentInstruction,
  RewardsOverview,
  StarsOverview,
} from "@/features/shared/types";

/**
 * Customer data loaders. Stars, packages, orders and notifications read the phase-4 services via shared/server-mappers.
 * Rewards and addresses still return "unavailable" (no read service yet, see BACKEND_GAPS). When a service is added, map its
 * result to the view-model type and return `ready(...)`. The pages and views need no change.
 * Every loader receives the signed-in user and must read only that user's data.
 */
type U = SessionUser["user"];

async function load<T>(work: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return ready(await work());
  } catch {
    return failed("تعذر تحميل البيانات. حاول مرة أخرى.");
  }
}

export async function loadStars(user: U): Promise<Loaded<StarsOverview>> {
  return load(() => mapStars(user));
}

export interface PackagesData {
  options: PackageOption[];
  current: CurrentPackage;
  instructions: PaymentInstruction[];
}
export async function loadPackages(user: U): Promise<Loaded<PackagesData>> {
  return load(() => mapPackages(user));
}

export async function loadOrders(user: U): Promise<Loaded<MainOrderView[]>> {
  return load(() => mapCustomerOrders(user));
}

export async function loadOrder(user: U, orderId: string): Promise<Loaded<MainOrderView | null>> {
  return load(() => mapCustomerOrder(user, orderId));
}

export async function loadRewards(_user: U): Promise<Loaded<RewardsOverview>> {
  return unavailable("customer.rewards");
}

export async function loadAddresses(_user: U): Promise<Loaded<AddressItem[]>> {
  return unavailable("customer.addresses");
}

export async function loadNotifications(user: U): Promise<Loaded<NotificationItem[]>> {
  return load(() => mapNotifications(user));
}
