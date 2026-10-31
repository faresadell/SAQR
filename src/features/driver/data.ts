import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { failed, ready, unavailable, type Loaded } from "@/features/shared/loaded";
import { mapNotifications, mapPackages, mapStars } from "@/features/shared/server-mappers";
import type { CurrentPackage, NotificationItem, PackageOption, PaymentInstruction, StarsOverview, TripView } from "@/features/shared/types";

/**
 * Driver loaders. HOOK-UP POINT for the backend developer (see BACKEND_GAPS). Today the schema ties a Driver to one
 * merchant and has no trip/task model, so every screen reports "unavailable". Read only the signed-in driver's data.
 */
type U = SessionUser["user"];

async function load<T>(work: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return ready(await work());
  } catch {
    return failed("تعذر تحميل البيانات. حاول مرة أخرى.");
  }
}


export interface DriverHomeData {
  active: TripView | null;
  availableCount: number;
  completedToday: number;
  starsBalance: number;
}
export async function loadDriverHome(_user: U): Promise<Loaded<DriverHomeData>> {
  return unavailable("driver.home");
}
export async function loadAvailableTasks(_user: U): Promise<Loaded<TripView[]>> {
  return unavailable("driver.tasks");
}
export async function loadActiveTrip(_user: U): Promise<Loaded<TripView | null>> {
  return unavailable("driver.trip");
}
export async function loadTripHistory(_user: U): Promise<Loaded<TripView[]>> {
  return unavailable("driver.history");
}
export interface DriverPackageData {
  options: PackageOption[];
  current: CurrentPackage;
  instructions: PaymentInstruction[];
  stars: StarsOverview;
}
export async function loadDriverPackage(user: U): Promise<Loaded<DriverPackageData>> {
  return load(async () => {
    const [pkg, stars] = await Promise.all([mapPackages(user), mapStars(user)]);
    return { ...pkg, stars };
  });
}
export async function loadDriverNotifications(user: U): Promise<Loaded<NotificationItem[]>> {
  return load(() => mapNotifications(user));
}
