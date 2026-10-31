import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

interface StateProps {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function StateShell({ icon, tone, title, children, action, className }: StateProps & { tone: "neutral" | "danger" | "info" }) {
  const chip = { neutral: "bg-canvas text-ink-muted", danger: "bg-danger-soft text-danger-ink", info: "bg-brand-soft text-navy-700" }[tone];
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center", className)}>
      {icon ? (
        <span className={cn("flex size-12 items-center justify-center rounded-full", chip)}>
          <Icon name={icon} className="size-6" />
        </span>
      ) : null}
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {children ? <div className="max-w-md text-sm text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Nothing to show yet (no orders, no products). Say what will appear here and offer the next step. */
export function EmptyState(props: StateProps) {
  return <StateShell tone="neutral" icon="box" {...props} />;
}

/** A request failed. Never present this as success; offer a retry when one exists. */
export function ErrorState(props: StateProps) {
  return <StateShell tone="danger" icon="alert" {...props} />;
}

/** The server capability behind this screen does not exist yet. Honest about it; no fake data. */
export function UnavailableState({ title = "هذه الخدمة غير متاحة حالياً", children, ...rest }: Partial<StateProps>) {
  return (
    <StateShell tone="info" icon="clock" title={title} {...rest}>
      {children ?? "سنفعّلها قريباً. لن تفقد أي بيانات."}
    </StateShell>
  );
}

/** Inline alert strip for page-level notices. */
export function Notice({ tone = "info", children, className }: { tone?: "info" | "success" | "warning" | "danger"; children: ReactNode; className?: string }) {
  const styles = {
    info: "bg-brand-soft text-navy-700",
    success: "bg-success-soft text-success-ink",
    warning: "bg-warning-soft text-warning-ink",
    danger: "bg-danger-soft text-danger-ink",
  }[tone];
  const icon: IconName = { info: "info", success: "checkCircle", warning: "alert", danger: "alert" }[tone] as IconName;
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-control p-3 text-sm font-medium", styles, className)}>
      <Icon name={icon} className="mt-0.5 size-4" />
      <span>{children}</span>
    </p>
  );
}
