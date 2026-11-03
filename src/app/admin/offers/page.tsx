import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { loadAdminOffers } from "@/features/admin/data";
import { OffersAdminPanel } from "@/features/admin/panels";
import { ResultState } from "@/features/shared/result-state";
import { AdminOfferForm } from "./offer-form";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "إدارة العروض" };

export default async function Page({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const { user } = await requirePermission("offers.manage");
  const { shop } = await searchParams;
  const result = await loadAdminOffers(user);
  const shops = await db.merchant.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } });
  const chosen = shops.find((x) => x.id === shop);
  const products = chosen ? await db.product.findMany({ where: { merchantId: chosen.id, archivedAt: null, isAvailable: true }, orderBy: { nameAr: "asc" }, take: 300, select: { id: true, nameAr: true, priceCents: true } }) : [];
  return (
    <>
      <PageHeader title="إدارة العروض" description="العروض الجارية والمنتهية، وإيقاف أي عرض مخالف." />
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">إنشاء عرض نيابةً عن نشاط</h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label htmlFor="shop" className="sr-only">النشاط</label>
          <select id="shop" name="shop" defaultValue={chosen?.id ?? ""} className="h-11 min-w-56 rounded-control border border-line bg-surface px-3 text-sm">
            <option value="" disabled>اختر النشاط</option>
            {shops.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button type="submit" className="h-11 rounded-control bg-navy-900 px-5 font-semibold text-white hover:bg-navy-800">اختيار</button>
        </form>
        {chosen ? <AdminOfferForm merchantId={chosen.id} products={products} /> : <p className="text-sm text-ink-muted">اختر النشاط أولاً لتظهر منتجاته ونموذج العرض.</p>}
      </Card>
      {result.status === "ready" ? <OffersAdminPanel rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
