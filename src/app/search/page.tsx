import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { loadBusinessTypes, loadShops } from "@/features/public/data";
import { ShopCard } from "@/features/public/shop-card";
import { AddToCart } from "@/features/public/add-to-cart";
import { OrderNow } from "@/features/public/order-now";
import { SafeImage } from "@/components/ui/safe-image";
import { formatEgp } from "@/lib/money";
import { searchPublicProducts } from "@/server/catalog/public";
import Link from "next/link";

export const metadata: Metadata = { title: "نتائج البحث" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim().slice(0, 60);
  const [types, shops, products] = await Promise.all([loadBusinessTypes(), term ? loadShops({ q: term }) : Promise.resolve([]), searchPublicProducts(term)]);
  const labels = new Map(types.map((t) => [t.code, t.nameAr]));

  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title={term ? `نتائج البحث عن «${term}»` : "البحث"} description="البحث بأسماء المنتجات وأسماء الأنشطة." />
        {!term ? (
          <EmptyState icon="search" title="اكتب اسم منتج أو نشاط للبحث">استخدم خانة البحث في أعلى الصفحة.</EmptyState>
        ) : shops.length === 0 && products.length === 0 ? (
          <EmptyState icon="search" title="لا نتائج مطابقة">تأكد من الإملاء أو جرّب جزءاً أقصر من الاسم.</EmptyState>
        ) : (
          <>
            {products.length > 0 ? (
              <section className="flex flex-col gap-3" aria-label="منتجات">
                <h2 className="text-lg font-bold">المنتجات</h2>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {products.map((p) => {
                    const cart = { productId: p.id, merchantId: p.shop.id, merchantName: p.shop.name, name: p.nameAr, priceCents: p.priceCents, isAvailable: p.isAvailable };
                    return (
                      <li key={p.id} className="flex gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
                        <SafeImage alt="" src={p.hasImage ? `/api/v1/products/${p.id}/image` : null} fallbackIcon="box" className="size-24 shrink-0 rounded-control" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <Link href={`/shops/${p.shop.id}/products/${p.id}`} className="font-bold text-ink hover:text-brand">{p.nameAr}</Link>
                          <Link href={`/shops/${p.shop.id}`} className="text-sm text-ink-muted hover:underline">من {p.shop.name}</Link>
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span className="num font-bold text-ink">{formatEgp(p.priceCents)}</span>
                            <div className="flex items-center gap-2">
                              <AddToCart {...cart} />
                              <OrderNow {...cart} />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {shops.length > 0 ? (
              <section className="flex flex-col gap-3" aria-label="الأنشطة">
                <h2 className="text-lg font-bold">الأنشطة</h2>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shops.map((s) => (
                    <li key={s.id}>
                      <ShopCard shop={s} typeLabel={labels.get(s.businessType)} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </SiteShell>
  );
}
