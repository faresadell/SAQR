import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { BACKEND_GAPS } from "./backend-gaps";
import type { Loaded } from "./loaded";

/**
 * Renders a dashboard section from a loader result: the content when ready, otherwise a compact,
 * honest placeholder (never fake numbers). Used where several independent sections share one page.
 */
export function SectionGate<T>({ result, children, className }: { result: Loaded<T>; children: (data: T) => ReactNode; className?: string }) {
  if (result.status === "ready") return <>{children(result.data)}</>;
  const text = result.status === "error" ? result.message : null;
  const gap = result.status === "unavailable" ? BACKEND_GAPS[result.feature] : null;
  return (
    <div className={cn("flex items-start gap-3 rounded-card border border-dashed border-line-strong bg-surface p-4 text-sm text-ink-muted", className)}>
      <Icon name={result.status === "error" ? "alert" : "clock"} className="mt-0.5 size-4" />
      <div className="min-w-0">
        <p className="font-semibold text-ink">{gap ? `${gap.title}: غير متاحة حالياً` : "تعذر تحميل هذا القسم"}</p>
        <p>{text ?? "سيظهر هذا القسم عند تفعيل الخدمة."}</p>
        {gap && process.env.NODE_ENV !== "production" ? <p className="mt-1 text-xs">للمطوّر: {gap.needs}</p> : null}
      </div>
    </div>
  );
}
