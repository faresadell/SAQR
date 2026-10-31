import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { loadBusinessTypes, loadShops } from "@/features/public/data";
import { ShopCard } from "@/features/public/shop-card";

export const metadata: Metadata = { title: "نتائج البحث" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim().slice(0, 60);
  const [types, shops] = await Promise.all([loadBusinessTypes(), term ? loadShops({ q: term }) : Promise.resolve([])]);
  const labels = new Map(types.map((t) => [t.code, t.nameAr]));

  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title={term ? `نتائج البحث عن «${term}»` : "البحث"} description="البحث بأسماء الأنشطة. للبحث عن منتج، افتح النشاط واستخدم بحث قائمته." />
        {!term ? (
          <EmptyState icon="search" title="اكتب اسم نشاط للبحث">استخدم خانة البحث في أعلى الصفحة.</EmptyState>
        ) : shops.length === 0 ? (
          <EmptyState icon="search" title="لا نتائج مطابقة">تأكد من الإملاء أو جرّب جزءاً أقصر من الاسم.</EmptyState>
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
