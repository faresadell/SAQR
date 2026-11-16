import type { DayPoint } from "@/lib/analytics/days";
import { formatEgp } from "@/lib/money";

/** One bar per day for the last 30 days. Plain CSS (no chart library). Quiet days are real zeros, drawn as an empty slot. */
export function DailyBars({ days, metric, label }: { days: readonly DayPoint[]; metric: "count" | "cents"; label: string }) {
  const values = days.map((d) => (metric === "count" ? d.count : d.cents));
  const max = Math.max(...values, 0);
  const total = values.reduce((a, b) => a + b, 0);
  if (max === 0) return <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">لا توجد بيانات في آخر {days.length} يوماً.</p>;
  const fmt = (v: number) => (metric === "count" ? String(v) : formatEgp(v));
  return (
    <figure className="flex flex-col gap-2" aria-label={`${label}: الإجمالي ${fmt(total)}، أعلى يوم ${fmt(max)}`}>
      <div className="flex h-36 items-end gap-[3px]" dir="ltr">
        {days.map((d, i) => (
          <div key={d.day} className="flex h-full flex-1 items-end" title={`${d.day}: ${fmt(values[i] ?? 0)}`}>
            <div className="w-full rounded-t-sm bg-brand" style={{ height: `${Math.max(((values[i] ?? 0) / max) * 100, (values[i] ?? 0) > 0 ? 3 : 0)}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="flex justify-between text-xs text-ink-muted" dir="ltr">
        <span className="num">{days[0]?.day}</span>
        <span>أعلى يوم: <span className="num font-semibold text-ink">{fmt(max)}</span></span>
        <span className="num">{days[days.length - 1]?.day}</span>
      </figcaption>
    </figure>
  );
}
