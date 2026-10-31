import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadOrders } from "@/features/customer/data";
import { OrdersListView } from "@/features/customer/orders-views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "طلباتي" };

export default async function OrdersPage() {
  const { user } = await requireRole("CUSTOMER");
  const result = await loadOrders(user);
  return (
    <>
      <PageHeader title="طلباتي" description="كل طلب رئيسي وطلباته الفرعية لكل نشاط." />
      {result.status === "ready" ? <OrdersListView orders={result.data} base="/account" /> : <ResultState result={result} />}
    </>
  );
}
