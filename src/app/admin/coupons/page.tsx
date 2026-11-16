import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { CouponsPanel } from "@/features/coupons/coupons-panel";
import { requirePermission } from "@/server/auth/guards";
import { listCoupons } from "@/server/coupons/service";

export const metadata: Metadata = { title: "الكوبونات" };

export default async function Page() {
  const { user } = await requirePermission("offers.manage");
  const rows = await listCoupons(user);
  return (
    <>
      <PageHeader title="الكوبونات" description="كوبونات المنصة (تتحملها المنصة) وكل كوبونات الأنشطة مع الاستخدام." />
      <CouponsPanel platform={true} rows={rows.map((r) => ({ ...r, expiresAt: r.expiresAt.toISOString() }))} />
    </>
  );
}
