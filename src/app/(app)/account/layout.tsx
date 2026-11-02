import { redirect } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { customerNav } from "@/features/shared/nav";
import { ROLE_HOME } from "@/features/shared/role-home";
import { requireUser } from "@/server/auth/guards";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  // Other roles have their own area; send them home instead of showing a customer dashboard.
  if (user.role !== "CUSTOMER") redirect(ROLE_HOME[user.role]);
  const nav = customerNav("/account");
  return (
    <DashboardShell areaLabel="لوحة العميل" groups={nav.groups} mobileItems={nav.mobile} user={{ name: user.name, subtitle: user.phone }} logoutAction={logoutAction}>
      {children}
    </DashboardShell>
  );
}
