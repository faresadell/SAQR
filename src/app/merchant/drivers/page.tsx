import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DriversPanel } from "@/features/merchant/drivers-panel";
import { ResultState } from "@/features/shared/result-state";
import { failed, ready } from "@/features/shared/loaded";
import { requireRole } from "@/server/auth/guards";
import { listDriversForShop } from "@/server/drivers/service";

export const metadata: Metadata = { title: "اطلب سائق" };

export default async function MerchantDriversPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await listDriversForShop(user)
    .then((rows) => ready(rows))
    .catch(() => failed("تعذر تحميل السائقين. حاول مرة أخرى."));
  return (
    <>
      <PageHeader title="اطلب سائق" description="السائقون المتاحون وحالة كل واحد منهم." />
      {result.status === "ready" ? <DriversPanel drivers={result.data} /> : <ResultState result={result} />}
    </>
  );
}
