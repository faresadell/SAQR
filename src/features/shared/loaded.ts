/**
 * Result of a screen's data loader. Server pages call a loader from `src/features/<area>/data.ts` and render
 * the matching state, so the same page lights up unchanged once the backend provides the data.
 */
export type FeatureKey =
  | "customer.stars"
  | "customer.packages"
  | "customer.orders"
  | "customer.rewards"
  | "customer.addresses"
  | "customer.notifications"
  | "customer.checkout"
  | "public.offers"
  | "merchant.orders"
  | "merchant.offers"
  | "merchant.packages"
  | "merchant.reports"
  | "merchant.notifications"
  | "merchant.images"
  | "driver.home"
  | "driver.tasks"
  | "driver.trip"
  | "driver.history"
  | "driver.package"
  | "driver.notifications"
  | "admin.orders"
  | "admin.payments"
  | "admin.packages"
  | "admin.offers"
  | "admin.complaints"
  | "admin.notifications"
  | "admin.audit"
  | "admin.businesses"
  | "support";

export type Loaded<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable"; feature: FeatureKey }
  | { status: "error"; message: string };

export function ready<T>(data: T): Loaded<T> {
  return { status: "ready", data };
}

export function unavailable<T = never>(feature: FeatureKey): Loaded<T> {
  return { status: "unavailable", feature };
}

export function failed<T = never>(message: string): Loaded<T> {
  return { status: "error", message };
}
