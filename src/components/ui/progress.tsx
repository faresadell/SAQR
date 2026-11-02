import { cn } from "@/lib/cn";

interface ProgressProps {
  value: number;
  max: number;
  label: string;
  className?: string;
  tone?: "brand" | "success";
}

/** Determinate progress bar with proper ARIA values. */
export function Progress({ value, max, label, className, tone = "brand" }: ProgressProps) {
  const safeMax = Math.max(1, max);
  const clamped = Math.min(Math.max(0, value), safeMax);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-line", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", tone === "success" ? "bg-success" : "bg-brand")}
        style={{ width: `${(clamped / safeMax) * 100}%` }}
      />
    </div>
  );
}
