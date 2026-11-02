import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { loadMerchantDriverOptions, loadMerchantOrders } from "@/features/merchant/data";
import { MerchantOrdersView } from "@/features/merchant/views";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الطلبات" };

export default async function MerchantOrdersPage() {
  const { user } = await requireRole("MERCHANT");
  const [result, drivers] = await Promise.all([loadMerchantOrders(user), loadMerchantDriverOptions(user).catch(() => [])]);
  return (
    <>
      <PageHeader title="الطلبات" description="الطلبات الفرعية الخاصة بنشاطك: القبول والرفض وتحديث التجهيز." />
      {result.status === "ready" ? <MerchantOrdersView rows={result.data} drivers={drivers} /> : <ResultState result={result} />}
    </>
  );
}
