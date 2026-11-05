import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { SafeImage } from "@/components/ui/safe-image";
import { cn } from "@/lib/cn";
import type { ShopSummary } from "./types";

export function ShopCard({ shop, typeLabel }: { shop: ShopSummary; typeLabel?: string }) {
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="relative">
        <SafeImage alt="" src={shop.hasImage ? `/api/v1/shops/${shop.id}/image` : null} fallbackIcon="store" className="h-36 w-full bg-gradient-to-br from-navy-800 to-navy-900 text-silver-dim transition-transform duration-300 group-hover:scale-105" />
        <span className={cn("absolute start-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold shadow-card", shop.isOpen ? "bg-success text-white" : "bg-surface text-ink-muted")}>
          {shop.isOpen ? "مفتوح الآن" : "مغلق الآن"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="min-w-0 text-base font-bold text-ink group-hover:text-brand">{shop.name}</h3>
        {typeLabel ? <p className="text-xs font-semibold text-brand">{typeLabel}</p> : null}
        {shop.description ? <p className="line-clamp-2 text-sm text-ink-muted">{shop.description}</p> : null}
        {shop.address ? (
          <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-ink-muted">
            <Icon name="pin" className="size-3.5" />
            <span className="truncate">{shop.address}</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
