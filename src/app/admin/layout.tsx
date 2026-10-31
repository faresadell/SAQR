import { logoutAction } from "@/app/(auth)/actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { hasPermission } from "@/lib/auth/permissions";
import { adminNav, filterNav } from "@/features/shared/nav";
import { requireRole } from "@/server/auth/guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // First line of defense: only administrators see anything under /admin.
  // Every page and action below ALSO checks its own specific permission.
  const { user } = await requireRole("ADMIN");
  const nav = adminNav("/admin");
  // Hiding menu items is convenience only; the server enforces every permission.
  const groups = filterNav(nav.groups, (p) => hasPermission(user, p as Parameters<typeof hasPermission>[1]));
  const mobile = nav.mobile.filter((i) => !i.permission || hasPermission(user, i.permission as Parameters<typeof hasPermission>[1]));
  return (
    <DashboardShell areaLabel="لوحة الإدارة" groups={groups} mobileItems={mobile} user={{ name: user.name, subtitle: user.isSuperAdmin ? "المشرف الرئيسي" : "مشرف" }} logoutAction={logoutAction}>
      {children}
    </DashboardShell>
  );
}
