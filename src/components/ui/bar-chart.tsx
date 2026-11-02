import { formatNumber } from "@/lib/format";

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: readonly BarDatum[];
  /** Accessible name and visible caption of the chart. */
  title: string;
  /** Formats the value in the data table fallback and tooltips. */
  format?: (value: number) => string;
}

/**
 * Simple bar chart in HTML/CSS (no chart library). Bars are decorative; the same numbers are exposed
 * as a visually hidden table so screen readers and print get the real data.
 */
export function BarChart({ data, title, format = formatNumber }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
      <div aria-hidden="true" className="flex h-44 items-end gap-2 sm:gap-3">
        {data.map((d) => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className="num text-[11px] font-semibold text-ink-muted">{format(d.value)}</span>
            <div className="w-full max-w-10 rounded-t-md bg-navy-800" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
            <span className="w-full truncate text-center text-[11px] text-ink-faint">{d.label}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
