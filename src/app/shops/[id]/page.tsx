import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Notice } from "@/components/ui/states";
import { TabLinks } from "@/components/ui/tab-links";
import { loadBusinessTypes, loadCategories, loadShopPage } from "@/features/public/data";
import { shopHasPackage } from "@/server/plans/service";
import { getShopRating, listShopReviews } from "@/server/reviews/service";
import { formatDateTime } from "@/lib/format";
import { ProductRow } from "@/features/public/product-row";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const page = await loadShopPage(id.slice(0, 64), {});
  if (!page) return { title: "تفاصيل النشاط" };
  const name = page.shop.name;
  return { title: name, description: `تصفّح منتجات ${name} واطلب أونلاين عبر صقر.`, openGraph: { title: name, description: `اطلب من ${name} عبر صقر.` } };
}

export default async function ShopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; q?: string }> }) {
  const { id } = await params;
  const { c, q = "" } = await searchParams;
  const [categories, types] = await Promise.all([loadCategories(), loadBusinessTypes()]);
  const categoryId = categories.find((x) => x.id === c)?.id;
  const term = q.trim().slice(0, 60);
  const page = await loadShopPage(id.slice(0, 64), { ...(term ? { q: term } : {}), ...(categoryId ? { categoryId } : {}) });
  if (!page) notFound();
  const { shop, products, contact } = page;
  const [takesOrders, rating, reviews] = await Promise.all([shopHasPackage(shop.id), getShopRating(shop.id), listShopReviews(shop.id)]);
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
          {shop.hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/v1/shops/${shop.id}/image`} alt="" className="h-40 w-full max-w-md rounded-card object-cover" />
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">{shop.name}</h1>
            <Badge tone={shop.isOpen ? "success" : "neutral"}>{shop.isOpen ? "مفتوح الآن" : "مغلق الآن"}</Badge>
          </div>
          {typeLabel ? <p className="text-sm font-semibold text-silver">{typeLabel}</p> : null}
          <p className="flex items-center gap-1.5 text-sm text-silver" data-testid="shop-rating">
            <Icon name="star" className="size-4" />
            {rating.average === null ? "لا توجد تقييمات بعد" : <><span className="num font-bold text-white">{rating.average}</span> من 5 · <span className="num">{rating.count}</span> تقييم</>}
          </p>
          {shop.description ? <p className="max-w-2xl text-silver">{shop.description}</p> : null}
          {shop.address ? (
            <p className="flex items-center gap-2 text-sm text-silver">
              <Icon name="pin" className="size-4" />
              {shop.address}
            </p>
          ) : null}
          <Link href={`/account/chats/start?shop=${shop.id}`} className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-navy-900 hover:bg-white/90">
            <Icon name="message" className="size-4" />
            ابدأ محادثة مع النشاط
          </Link>
          {takesOrders ? (
            <Link href={`/account/requests/new?shop=${shop.id}`} className="inline-flex w-fit items-center gap-2 rounded-full border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
              <Icon name="box" className="size-4" />
              اطلب بكلماتك
            </Link>
          ) : null}
          {contact.phones.length > 0 || Object.keys(contact.social).length > 0 ? (
            <ul className="flex flex-wrap gap-2 text-sm" aria-label="التواصل مع النشاط">
              {contact.phones.map((ph) => (
                <li key={ph}><a href={`tel:${ph}`} dir="ltr" className="inline-block rounded-full bg-white/10 px-3 py-1 font-semibold hover:bg-white/20">{ph}</a></li>
              ))}
              {contact.social.whatsapp ? <li><a href={`https://wa.me/${contact.social.whatsapp.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full bg-white/10 px-3 py-1 font-semibold hover:bg-white/20">واتساب</a></li> : null}
              {([["facebook", "فيسبوك"], ["instagram", "إنستجرام"], ["tiktok", "تيك توك"], ["website", "الموقع"]] as const).map(([key, label]) => {
                const href = contact.social[key];
                return href ? <li key={key}><a href={href} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full bg-white/10 px-3 py-1 font-semibold hover:bg-white/20">{label}</a></li> : null;
              })}
            </ul>
          ) : null}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-page flex-col gap-5 px-4 py-6 sm:px-6">
        {!takesOrders ? <Notice tone="warning">هذا النشاط لا يستقبل طلبات حالياً.</Notice> : null}
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

        {reviews.length > 0 ? (
          <section className="flex flex-col gap-3" aria-label="تقييمات العملاء">
            <h2 className="text-lg font-bold">تقييمات العملاء</h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-card border border-line bg-surface p-3">
                  <p className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{r.author}</span>
                    <span className="num text-warning" aria-label={`${r.rating} من 5`}>{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span>
                  </p>
                  {r.comment ? <p className="mt-1 text-sm">{r.comment}</p> : null}
                  <p className="num mt-1 text-xs text-ink-muted">{formatDateTime(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
