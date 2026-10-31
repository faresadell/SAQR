import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileView } from "@/features/customer/views";
import { ROLE_LABEL } from "@/features/shared/role-home";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الملف الشخصي والدعم" };

export default async function ProfilePage() {
  const { user } = await requireRole("CUSTOMER");
  return (
    <>
      <PageHeader title="الملف الشخصي والدعم" />
      <ProfileView name={user.name} phone={user.phone} roleLabel={ROLE_LABEL[user.role]} />
    </>
  );
}
