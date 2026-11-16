/** Dependency-free vertical bars. Every bar has a text label for screen readers; heights are relative to the largest value. */
export function BarChart({ points, label, format }: { points: { key: string; value: number; caption: string }[]; label: string; format: (n: number) => string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((n, p) => n + p.value, 0);
  return (
    <figure className="flex flex-col gap-2" aria-label={label}>
      <div className="flex h-36 items-end gap-0.5" dir="ltr" role="img" aria-label={`${label}: ${format(total)}`}>
        {points.map((p) => (
          <div key={p.key} title={`${p.caption}: ${format(p.value)}`} className="flex h-full min-w-0 flex-1 items-end">
            <div className={p.value > 0 ? "w-full rounded-t-sm bg-brand" : "w-full rounded-t-sm bg-line"} style={{ height: `${p.value > 0 ? Math.max(4, (p.value / max) * 100) : 2}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="flex justify-between text-xs text-ink-muted" dir="ltr">
        <span>{points[0]?.caption}</span>
        <span>{points.at(-1)?.caption}</span>
      </figcaption>
    </figure>
  );
}
