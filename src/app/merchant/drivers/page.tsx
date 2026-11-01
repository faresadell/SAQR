import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DriversPanel } from "@/features/merchant/drivers-panel";
import { ResultState } from "@/features/shared/result-state";
import { failed, ready } from "@/features/shared/loaded";
import { requireRole } from "@/server/auth/guards";
import { listMyDrivers } from "@/server/drivers/service";

export const metadata: Metadata = { title: "السائقون" };

export default async function MerchantDriversPage() {
  const { user } = await requireRole("MERCHANT");
  const result = await listMyDrivers(user)
    .then((rows) => ready(rows.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))))
    .catch(() => failed("تعذر تحميل السائقين. حاول مرة أخرى."));
  return (
    <>
      <PageHeader title="السائقون" description="أضف سائقي نشاطك وأوقفهم مؤقتاً عند الحاجة." />
      {result.status === "ready" ? <DriversPanel drivers={result.data} /> : <ResultState result={result} />}
    </>
  );
}
