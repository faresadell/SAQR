import Link from "next/link";
import { SafeImage } from "@/components/ui/safe-image";
import { formatEgp } from "@/lib/money";
import { AddToCart } from "./add-to-cart";
import type { MenuProduct } from "./types";

export function ProductRow({ product, merchantId, merchantName }: { product: MenuProduct; merchantId: string; merchantName: string }) {
  return (
    <li className="flex gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
      <Link href={`/shops/${merchantId}/products/${product.id}`} className="shrink-0" aria-label={product.nameAr}>
        <SafeImage alt="" src={null} fallbackIcon="box" className="size-20 rounded-control" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/shops/${merchantId}/products/${product.id}`} className="font-bold text-ink hover:text-brand">
          {product.nameAr}
        </Link>
        {product.description ? <p className="line-clamp-2 text-sm text-ink-muted">{product.description}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="num font-bold text-ink">{formatEgp(product.priceCents)}</span>
          <AddToCart
            productId={product.id}
            merchantId={merchantId}
            merchantName={merchantName}
            name={product.nameAr}
            priceCents={product.priceCents}
            isAvailable={product.isAvailable}
          />
        </div>
      </div>
    </li>
  );
}
