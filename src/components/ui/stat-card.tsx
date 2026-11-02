import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

const chips: Record<Tone, string> = {
  brand: "bg-brand-soft text-navy-700",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-canvas text-ink-muted",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: IconName;
  tone?: Tone;
  /** Short supporting line, e.g. "تنتهي بعد 12 يوماً". */
  note?: ReactNode;
  className?: string;
}

/** Key figure with a tinted icon chip (dashboard top row). */
export function StatCard({ label, value, icon, tone = "brand", note, className }: StatCardProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        {icon ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-control", chips[tone])}>
            <Icon name={icon} className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="num text-2xl font-bold text-ink">{value}</div>
      {note ? <div className="text-xs text-ink-muted">{note}</div> : null}
    </div>
  );
}
