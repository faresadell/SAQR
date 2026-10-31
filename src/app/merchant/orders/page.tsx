import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMerchantOrders } from "@/features/merchant/data";
import { MerchantOrdersView } from "@/features/merchant/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الطلبات" };

export default async function MerchantOrdersPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await loadMerchantOrders(user);
  return (
    <>
      <PageHeader title="الطلبات" description="الطلبات الفرعية الخاصة بنشاطك: القبول والرفض وتحديث التجهيز." />
      {result.status === "ready" ? <MerchantOrdersView rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
