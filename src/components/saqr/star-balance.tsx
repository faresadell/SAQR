import { cn } from "@/lib/cn";
import { formatNumber, starsLabel } from "@/lib/format";
import { Icon } from "@/components/ui/icon";

interface StarBalanceProps {
  /** Balance exactly as the server returned it (display only; never edited or computed here). */
  balance: number;
  caption?: string;
  className?: string;
}

export function StarBalance({ balance, caption = "رصيد النجوم", className }: StarBalanceProps) {
  return (
    <div className={cn("flex items-center gap-4 rounded-card bg-navy-900 p-5 text-white shadow-card", className)}>
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-warning">
        <Icon name="star" className="size-7 fill-current" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-silver">{caption}</p>
        <p className="num text-3xl font-bold" aria-label={starsLabel(balance)}>{formatNumber(balance)}</p>
      </div>
    </div>
  );
}
