import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { SafeImage } from "@/components/ui/safe-image";
import type { ShopSummary } from "./types";

export function ShopCard({ shop, typeLabel }: { shop: ShopSummary; typeLabel?: string }) {
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-shadow hover:shadow-pop"
    >
      <SafeImage alt="" src={null} fallbackIcon="store" className="h-28 w-full bg-gradient-to-br from-navy-800 to-navy-900 text-silver-dim" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-bold text-ink group-hover:text-brand">{shop.name}</h3>
          <Badge tone={shop.isOpen ? "success" : "neutral"}>{shop.isOpen ? "مفتوح الآن" : "مغلق الآن"}</Badge>
        </div>
        {typeLabel ? <p className="text-xs font-semibold text-ink-faint">{typeLabel}</p> : null}
        {shop.description ? <p className="line-clamp-2 text-sm text-ink-muted">{shop.description}</p> : null}
        {shop.address ? (
          <p className="mt-auto flex items-center gap-1.5 text-xs text-ink-muted">
            <Icon name="pin" className="size-3.5" />
            <span className="truncate">{shop.address}</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
