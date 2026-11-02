import { logoutAction } from "@/app/(auth)/actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { merchantNav } from "@/features/shared/nav";
import { requireRole } from "@/server/auth/guards";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireRole("MERCHANT");
  const nav = merchantNav("/merchant");
  return (
    <DashboardShell areaLabel="لوحة التاجر" groups={nav.groups} mobileItems={nav.mobile} user={{ name: user.name, subtitle: user.phone }} logoutAction={logoutAction}>
      {children}
    </DashboardShell>
  );
}
