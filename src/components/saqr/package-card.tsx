import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatEgp } from "@/lib/money";
import { formatNumber } from "@/lib/format";
import { Icon } from "@/components/ui/icon";
import type { PackageOption } from "@/features/shared/types";

interface PackageCardProps {
  option: PackageOption;
  selected?: boolean;
  /** Action area (choose button, form). The card never changes balances itself. */
  action?: ReactNode;
  featured?: boolean;
}

/** One purchasable package: price, base stars, bonus stars, total (and offer quota for merchants). */
export function PackageCard({ option, selected, action, featured }: PackageCardProps) {
  return (
    <article
      aria-label={`باقة ${option.name}`}
      className={cn(
        "flex flex-col gap-4 rounded-card border bg-surface p-5 shadow-card",
        selected ? "border-brand ring-2 ring-brand/30" : "border-line",
        featured && !selected && "border-navy-700",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{option.name}</h3>
        {selected ? <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-navy-700">مختارة</span> : null}
      </div>
      <p className="num text-3xl font-bold text-ink">{formatEgp(option.priceCents)}</p>
      <dl className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-control bg-canvas p-2">
          <dt className="text-xs text-ink-muted">أساسية</dt>
          <dd className="num font-bold">{formatNumber(option.baseStars)}</dd>
        </div>
        <div className="rounded-control bg-canvas p-2">
          <dt className="text-xs text-ink-muted">إضافية</dt>
          <dd className="num font-bold">{formatNumber(option.bonusStars)}</dd>
        </div>
        <div className="rounded-control bg-navy-900 p-2 text-white">
          <dt className="text-xs text-silver">الإجمالي</dt>
          <dd className="num font-bold">{formatNumber(option.baseStars + option.bonusStars)}</dd>
        </div>
      </dl>
      {typeof option.offerQuota === "number" ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Icon name="tag" className="size-4" />
          <span>حصة العروض: <strong className="num text-ink">{formatNumber(option.offerQuota)}</strong> عروض لكل دورة</span>
        </p>
      ) : null}
      {action ? <div className="mt-auto">{action}</div> : null}
    </article>
  );
}
