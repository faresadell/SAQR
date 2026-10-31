import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabLink {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}

/** Filter chips / section tabs rendered as real links (server-friendly, keyboard accessible). */
export function TabLinks({ items, label }: { items: readonly TabLink[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors",
            t.active ? "bg-navy-900 text-white" : "bg-surface text-ink-muted border border-line hover:bg-canvas",
          )}
        >
          {t.label}
          {typeof t.count === "number" ? <span className="num text-xs opacity-80">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
