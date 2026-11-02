import { logoutAction } from "@/app/(auth)/actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { driverNav } from "@/features/shared/nav";
import { requireRole } from "@/server/auth/guards";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireRole("DRIVER");
  const nav = driverNav("/driver");
  return (
    <DashboardShell areaLabel="لوحة السائق" groups={nav.groups} mobileItems={nav.mobile} user={{ name: user.name, subtitle: user.phone }} logoutAction={logoutAction}>
      {children}
    </DashboardShell>
  );
}
