import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/** A titled group of rows, as in the settings of well-known apps: one rounded card, thin dividers between rows. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-bold text-ink-muted">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">{children}</ul>
    </section>
  );
}

const rowClass = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start hover:bg-canvas";

function RowIcon({ name, danger }: { name: IconName; danger?: boolean }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-control", danger ? "bg-danger-soft text-danger-ink" : "bg-brand-soft text-navy-700")}>
      <Icon name={name} className="size-5" />
    </span>
  );
}

/** A row that opens a page. The arrow points to the reading direction's "forward" (left in Arabic). */
export function SettingsLink({ href, icon, label, hint }: { href: string; icon: IconName; label: string; hint?: string }) {
  return (
    <li>
      <Link href={href} className={rowClass}>
        <RowIcon name={icon} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{label}</span>
          {hint ? <span className="block text-sm text-ink-muted">{hint}</span> : null}
        </span>
        <Icon name="chevronRight" flip className="size-5 text-ink-muted" />
      </Link>
    </li>
  );
}

/** A row that submits a form (sign out). */
export function SettingsAction({ action, icon, label, danger }: { action: () => void | Promise<void>; icon: IconName; label: string; danger?: boolean }) {
  return (
    <li>
      <form action={action}>
        <button type="submit" className={cn(rowClass, danger && "text-danger-ink")}>
          <RowIcon name={icon} danger={danger} />
          <span className="flex-1 font-semibold">{label}</span>
        </button>
      </form>
    </li>
  );
}
