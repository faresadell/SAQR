import { logoutAction } from "@/app/(auth)/actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { merchantNav } from "@/features/shared/nav";
import { Notice } from "@/components/ui/states";
import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { hasEverHadPackage } from "@/server/plans/service";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireRole("MERCHANT");
  const nav = merchantNav("/merchant");
  const hasPackage = await hasEverHadPackage(user.id);
  return (
    <DashboardShell areaLabel="لوحة التاجر" groups={nav.groups} mobileItems={nav.mobile} user={{ name: user.name, subtitle: user.phone }} logoutAction={logoutAction}>
      {hasPackage ? null : (
        <Notice tone="warning" className="mb-4">
          لن يستطيع أحد الطلب من نشاطك ولا يمكنك نشر عروض قبل الاشتراك في باقة. <Link href="/merchant/packages" className="font-bold underline">اختر باقتك</Link>
        </Notice>
      )}
      {children}
    </DashboardShell>
  );
}
