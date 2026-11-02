import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Notice } from "@/components/ui/states";
import { TabLinks } from "@/components/ui/tab-links";
import { loadBusinessTypes, loadCategories, loadShopPage } from "@/features/public/data";
import { ProductRow } from "@/features/public/product-row";

export const metadata: Metadata = { title: "تفاصيل النشاط" };

export default async function ShopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; q?: string }> }) {
  const { id } = await params;
  const { c, q = "" } = await searchParams;
  const [categories, types] = await Promise.all([loadCategories(), loadBusinessTypes()]);
  const categoryId = categories.find((x) => x.id === c)?.id;
  const term = q.trim().slice(0, 60);
  const page = await loadShopPage(id.slice(0, 64), { ...(term ? { q: term } : {}), ...(categoryId ? { categoryId } : {}) });
  if (!page) notFound();
  const { shop, products } = page;
  const typeLabel = types.find((t) => t.code === shop.businessType)?.nameAr;
  const base = `/shops/${shop.id}`;
  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <SiteShell>
      <section className="bg-navy-900 text-white">
        <div className="mx-auto flex w-full max-w-page flex-col gap-3 px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">{shop.name}</h1>
            <Badge tone={shop.isOpen ? "success" : "neutral"}>{shop.isOpen ? "مفتوح الآن" : "مغلق الآن"}</Badge>
          </div>
          {typeLabel ? <p className="text-sm font-semibold text-silver">{typeLabel}</p> : null}
          {shop.description ? <p className="max-w-2xl text-silver">{shop.description}</p> : null}
          {shop.address ? (
            <p className="flex items-center gap-2 text-sm text-silver">
              <Icon name="pin" className="size-4" />
              {shop.address}
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-page flex-col gap-5 px-4 py-6 sm:px-6">
        {!shop.isOpen ? <Notice tone="warning">النشاط مغلق الآن. يمكنك تصفح القائمة، وقد لا يُقبل الطلب حتى يفتح.</Notice> : null}

        <form action={base} role="search" className="flex gap-2">
          {categoryId ? <input type="hidden" name="c" value={categoryId} /> : null}
          <label htmlFor="menu-q" className="sr-only">ابحث في القائمة</label>
          <input id="menu-q" name="q" defaultValue={term} maxLength={60} placeholder="ابحث في قائمة هذا النشاط" className="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3" />
          <button type="submit" className="h-11 rounded-control bg-navy-900 px-5 font-semibold text-white hover:bg-navy-800">بحث</button>
        </form>

        {categories.length > 0 ? (
          <TabLinks
            label="تصنيفات القائمة"
            items={[
              { href: qs({ q: term || undefined }), label: "الكل", active: !categoryId },
              ...categories.map((x) => ({ href: qs({ c: x.id, q: term || undefined }), label: x.label, active: categoryId === x.id })),
            ]}
          />
        ) : null}

        {products.length === 0 ? (
          <EmptyState icon="box" title="لا توجد منتجات مطابقة">{term || categoryId ? "جرّب إزالة التصفية أو تغيير البحث." : "لم يضف هذا النشاط منتجات بعد."}</EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} merchantId={shop.id} merchantName={shop.name} />
            ))}
          </ul>
        )}
      </div>
    </SiteShell>
  );
}
