import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { Icon } from "@/components/ui/icon";

export interface TimelineStep {
  key: string;
  label: string;
  /** ISO timestamp the server recorded, when the step happened. */
  at?: string;
  state: "done" | "current" | "upcoming" | "failed";
  note?: string;
}

/** Vertical order/trip timeline. Built from server events; the UI never invents a step that did not happen. */
export function OrderTimeline({ steps, label }: { steps: readonly TimelineStep[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s.state === "current" ? "step" : undefined}>
            {!last ? <span aria-hidden="true" className={cn("absolute start-[0.9rem] top-8 bottom-0 w-0.5", s.state === "done" ? "bg-success" : "bg-line")} /> : null}
            <span
              className={cn(
                "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                s.state === "done" && "border-success bg-success text-white",
                s.state === "current" && "border-brand bg-brand-soft text-brand",
                s.state === "upcoming" && "border-line-strong bg-surface text-silver-dim",
                s.state === "failed" && "border-danger bg-danger text-white",
              )}
            >
              <Icon name={s.state === "done" ? "check" : s.state === "failed" ? "x" : "clock"} className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm font-semibold", s.state === "upcoming" ? "text-ink-muted" : "text-ink")}>{s.label}</p>
              {s.at ? <p className="num text-xs text-ink-muted">{formatDateTime(s.at)}</p> : null}
              {s.note ? <p className="text-xs text-ink-muted">{s.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
