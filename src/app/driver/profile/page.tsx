import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadDriverNotifications } from "@/features/driver/data";
import { ProfileView } from "@/features/customer/views";
import { ResultState } from "@/features/shared/result-state";
import { ROLE_LABEL } from "@/features/shared/role-home";
import { NotificationsView } from "@/features/shared/shared-views";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الملف والإشعارات والدعم" };

export default async function DriverProfilePage() {
  const { user } = await requireRole("DRIVER");
  const notifications = await loadDriverNotifications(user);
  return (
    <>
      <PageHeader title="الملف والإشعارات والدعم" />
      <ProfileView name={user.name} phone={user.phone} roleLabel={ROLE_LABEL[user.role]} />
      <h2 className="text-lg font-bold">الإشعارات</h2>
      {notifications.status === "ready" ? <NotificationsView items={notifications.data} /> : <ResultState result={notifications} />}
    </>
  );
}
