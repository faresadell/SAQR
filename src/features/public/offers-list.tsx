import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import type { PublicOfferView } from "./data";

export function OffersList({ offers }: { offers: PublicOfferView[] }) {
  if (offers.length === 0) return <EmptyState icon="tag" title="لا توجد عروض سارية الآن">ستظهر هنا العروض عندما تنشرها الأنشطة.</EmptyState>;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {offers.map((o) => (
        <li key={o.id}>
          <Card className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{o.title}</h2>
                <Link href={`/shops/${o.shop.id}`} className="text-sm font-semibold text-brand underline">{o.shop.name}</Link>
              </div>
              {o.discountLabel ? <Badge tone="success">{o.discountLabel}</Badge> : null}
            </div>
            {o.description ? <p className="text-sm text-ink-muted">{o.description}</p> : null}
            {o.products.length > 0 ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                {o.products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <Link href={`/shops/${o.shop.id}/products/${p.id}`} className="underline">{p.name}</Link>
                    <span className="num">
                      <s className="text-ink-muted">{formatEgp(p.priceCents)}</s> <strong>{formatEgp(p.finalPriceCents)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-auto text-xs text-ink-muted">ينتهي العرض في <span className="num">{formatDate(o.endsAt)}</span></p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
