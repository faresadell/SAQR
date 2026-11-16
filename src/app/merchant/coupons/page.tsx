import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { CouponsPanel } from "@/features/coupons/coupons-panel";
import { requireRole } from "@/server/auth/guards";
import { listCoupons } from "@/server/coupons/service";

export const metadata: Metadata = { title: "الكوبونات" };

export default async function Page() {
  const { user } = await requireRole("MERCHANT");
  const rows = await listCoupons(user);
  return (
    <>
      <PageHeader title="الكوبونات" description="أنشئ أكواد خصم لمتجرك. العميل يكتب الكود عند تأكيد الطلب." />
      <CouponsPanel platform={false} rows={rows.map((r) => ({ ...r, expiresAt: r.expiresAt.toISOString() }))} />
    </>
  );
}
