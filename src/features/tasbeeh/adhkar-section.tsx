"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { ADHKAR } from "./adhkar-data";

/** Adhkar lists with a tap-to-count button per item. Progress lives in memory only (it resets when the page closes). */
export function AdhkarSection() {
  const [tab, setTab] = useState<string>(ADHKAR[0]!.id);
  const [done, setDone] = useState<Record<string, number>>({});
  const category = ADHKAR.find((c) => c.id === tab) ?? ADHKAR[0]!;
  const finished = category.items.filter((i) => (done[i.id] ?? 0) >= i.repeat).length;

  function tap(id: string, repeat: number) {
    setDone((d) => ((d[id] ?? 0) >= repeat ? d : { ...d, [id]: (d[id] ?? 0) + 1 }));
    try {
      navigator.vibrate?.(12);
    } catch {
      /* vibration is optional */
    }
  }

  return (
    <Card className="flex flex-col gap-4" id="adhkar">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">الأذكار</h2>
        <span className="num text-xs text-ink-muted">{formatNumber(finished)} من {formatNumber(category.items.length)}</span>
      </div>
      <div role="tablist" aria-label="أقسام الأذكار" className="flex gap-2 overflow-x-auto pb-1">
        {ADHKAR.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            onClick={() => setTab(c.id)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-all duration-200 active:scale-95",
              tab === c.id ? "border-navy-900 bg-navy-900 text-white shadow-card" : "border-line bg-surface text-ink hover:bg-canvas",
            )}
          >
            {c.title}
          </button>
        ))}
      </div>
      <ul key={category.id} className="flex flex-col gap-3" role="tabpanel">
        {category.items.map((item, index) => {
          const n = done[item.id] ?? 0;
          const complete = n >= item.repeat;
          return (
            <li
              key={item.id}
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              className={cn(
                "animate-rise-in rounded-sheet border p-4 transition-colors duration-300",
                complete ? "border-success bg-success-soft" : "border-line bg-surface",
              )}
            >
              <p className="text-lg leading-loose">{item.text}</p>
              <button
                type="button"
                onClick={() => tap(item.id, item.repeat)}
                disabled={complete}
                aria-label={`${complete ? "اكتمل" : "عدّ"} ${formatNumber(n)} من ${formatNumber(item.repeat)}`}
                className={cn(
                  "mt-3 flex h-12 w-full touch-manipulation select-none items-center justify-center gap-2 rounded-control font-bold transition-transform active:scale-[0.97]",
                  complete ? "bg-success text-white" : "bg-navy-900 text-white hover:bg-navy-800",
                )}
              >
                <Icon name={complete ? "check" : "plus"} className="size-5" />
                <span className="num">{formatNumber(n)} / {formatNumber(item.repeat)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-muted">نصوص مختصرة للتذكير. راجع مصدراً موثوقاً للصيغ الكاملة.</p>
    </Card>
  );
}
