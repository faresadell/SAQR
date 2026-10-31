import type { Metadata } from "next";
import { CustomerHomeView } from "@/features/customer/views";
import { loadNotifications, loadOrders, loadPackages, loadRewards, loadStars } from "@/features/customer/data";
import { failed, ready, type Loaded } from "@/features/shared/loaded";
import type { CurrentPackage } from "@/features/shared/types";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "حسابي" };

export default async function AccountHomePage() {
  const { user } = await requireRole("CUSTOMER");
  const [stars, packages, orders, rewards, notifications] = await Promise.all([
    loadStars(user),
    loadPackages(user),
    loadOrders(user),
    loadRewards(user),
    loadNotifications(user),
  ]);
  const pkg: Loaded<CurrentPackage> = packages.status === "ready" ? ready(packages.data.current) : packages.status === "error" ? failed(packages.message) : packages;
  return <CustomerHomeView base="/account" name={user.name} stars={stars} pkg={pkg} orders={orders} rewards={rewards} notifications={notifications} />;
}
