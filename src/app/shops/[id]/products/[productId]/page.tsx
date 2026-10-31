import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { Icon } from "@/components/ui/icon";
import { SafeImage } from "@/components/ui/safe-image";
import { Badge } from "@/components/ui/badge";
import { loadShopPage } from "@/features/public/data";
import { AddToCart } from "@/features/public/add-to-cart";
import { formatEgp } from "@/lib/money";

export const metadata: Metadata = { title: "تفاصيل المنتج" };

export default async function ProductPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params;
  const page = await loadShopPage(id.slice(0, 64));
  const product = page?.products.find((p) => p.id === productId);
  if (!page || !product) notFound();
  const { shop } = page;

  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-6 sm:px-6">
        <nav aria-label="مسار التنقل" className="flex items-center gap-2 text-sm text-ink-muted">
          <Link href={`/shops/${shop.id}`} className="font-semibold text-brand hover:underline">{shop.name}</Link>
          <Icon name="chevronLeft" className="size-4" />
          <span aria-current="page" className="truncate">{product.nameAr}</span>
        </nav>

        <div className="grid gap-6 md:grid-cols-2">
          <SafeImage alt={`صورة ${product.nameAr} غير متوفرة`} src={null} fallbackIcon="box" className="aspect-square w-full rounded-card" />
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{product.nameAr}</h1>
              <Badge tone={product.isAvailable ? "success" : "neutral"}>{product.isAvailable ? "متاح" : "غير متاح"}</Badge>
            </div>
            <p className="num text-3xl font-bold">{formatEgp(product.priceCents)}</p>
            {product.description ? <p className="leading-8 text-ink-muted">{product.description}</p> : null}
            <p className="text-sm text-ink-muted">من <Link href={`/shops/${shop.id}`} className="font-semibold text-brand hover:underline">{shop.name}</Link>. رسوم التوصيل تُحسب منفصلة عند تأكيد الطلب.</p>
            <AddToCart
              productId={product.id}
              merchantId={shop.id}
              merchantName={shop.name}
              name={product.nameAr}
              priceCents={product.priceCents}
              isAvailable={product.isAvailable}
              withQuantity
            />
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
