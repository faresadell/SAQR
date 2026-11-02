import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { TabLinks } from "@/components/ui/tab-links";
import { loadBusinessTypes, loadShops } from "@/features/public/data";
import { ShopCard } from "@/features/public/shop-card";

export const metadata: Metadata = { title: "استكشف الأنشطة" };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const types = await loadBusinessTypes();
  const activeType = types.find((t) => t.code === type)?.code;
  const shops = await loadShops(activeType ? { businessType: activeType } : {});
  const labels = new Map(types.map((t) => [t.code, t.nameAr]));

  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title="استكشف الأنشطة" description="كل الأنشطة المعتمدة في صقر. اختر تصنيفاً أو ابحث بالاسم من الأعلى." />
        <TabLinks
          label="تصفية حسب نوع النشاط"
          items={[
            { href: "/explore", label: "الكل", active: !activeType },
            ...types.map((t) => ({ href: `/explore?type=${encodeURIComponent(t.code)}`, label: t.nameAr, active: activeType === t.code })),
          ]}
        />
        {shops.length === 0 ? (
          <EmptyState icon="store" title="لا توجد أنشطة في هذا التصنيف حالياً">جرّب تصنيفاً آخر أو عد لاحقاً.</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((s) => (
              <li key={s.id}>
                <ShopCard shop={s} typeLabel={labels.get(s.businessType)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
