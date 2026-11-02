import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadAdminOrders } from "@/features/admin/data";
import { AdminOrdersView } from "@/features/admin/views";
import { ResultState } from "@/features/shared/result-state";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الطلبات" };

export default async function Page() {
  const { user } = await requirePermission("orders.view");
  const result = await loadAdminOrders(user);
  return (
    <>
      <PageHeader title="الطلبات الرئيسية والفرعية" description="كل الطلبات مع حالات الدفع والتجهيز والتوصيل لكل طلب فرعي." />
      {result.status === "ready" ? <AdminOrdersView rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
