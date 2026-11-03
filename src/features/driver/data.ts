import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { listMyDeliveries } from "@/server/orders/delivery";
import { listBoard } from "@/server/orders/driver-board";
import { failed, ready, type Loaded } from "@/features/shared/loaded";
import type { BoardRow } from "./board-view";
import { mapNotifications, mapPackages, mapStars } from "@/features/shared/server-mappers";
import type { CurrentPackage, NotificationItem, PackageOption, PaymentInstruction, StarsOverview } from "@/features/shared/types";

/**
 * Driver loaders over the real delivery service. A driver may work for one shop or independently; each loader reads
 * only the signed-in driver's own deliveries, plus the open board (without customer details).
 */
type U = SessionUser["user"];

async function load<T>(work: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return ready(await work());
  } catch {
    return failed("تعذر تحميل البيانات. حاول مرة أخرى.");
  }
}


export interface DriverDeliveryRow {
  orderId: string;
  number: number;
  shop: string;
  orderStatus: string;
  deliveryStatus: "DRIVER_ASSIGNED" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | string;
  feeToCollectCents: number;
  collectionStatus: string;
  addressLine: string;
  customerName: string;
  customerPhone: string;
  assignedAt: string;
  deliveredAt: string | null;
}

function toRow(r: Awaited<ReturnType<typeof listMyDeliveries>>[number]): DriverDeliveryRow {
  const line = (r.address as { line?: unknown } | null)?.line;
  return {
    orderId: r.orderId,
    number: r.number,
    shop: r.shop,
    orderStatus: r.orderStatus,
    deliveryStatus: r.deliveryStatus,
    feeToCollectCents: r.feeToCollectCents,
    collectionStatus: r.collectionStatus,
    addressLine: typeof line === "string" ? line : "",
    customerName: r.customer.name,
    customerPhone: r.customer.phone,
    assignedAt: (r.assignedAt ?? new Date(0)).toISOString(),
    deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
  };
}

/** Deliveries this driver holds: accepted from the open board or given by a shop. */
export async function loadMyDeliveries(user: U, scope: "ACTIVE" | "HISTORY"): Promise<Loaded<DriverDeliveryRow[]>> {
  return load(async () => (await listMyDeliveries(user, scope)).map(toRow));
}

export interface DriverHomeData {
  waitingPickup: number;
  onTheRoad: number;
  completedToday: number;
  starsBalance: number;
}
export async function loadDriverHome(user: U): Promise<Loaded<DriverHomeData>> {
  return load(async () => {
    const [active, history, stars] = await Promise.all([listMyDeliveries(user, "ACTIVE"), listMyDeliveries(user, "HISTORY"), mapStars(user)]);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
    return {
      waitingPickup: active.filter((r) => r.deliveryStatus === "DRIVER_ASSIGNED").length,
      onTheRoad: active.filter((r) => r.deliveryStatus !== "DRIVER_ASSIGNED").length,
      completedToday: history.filter((r) => r.deliveryStatus === "DELIVERED" && r.deliveredAt && r.deliveredAt.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }) === today).length,
      starsBalance: stars.balance,
    };
  });
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

/** The open board: accepted and paid orders still without a driver. Customer details are not part of it. */
export async function loadBoard(user: U): Promise<Loaded<BoardRow[]>> {
  return load(async () => (await listBoard(user)).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}
