import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { StarBalance } from "@/components/saqr/star-balance";
import { formatDateTime, formatNumber, starsLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MUTABLE_GROUPS } from "@/lib/notifications/mutable";
import { requireUser } from "@/server/auth/guards";
import { listMyMutedGroups } from "@/server/notifications/service";
import { markAllReadAction, setMuteAction } from "./notification-actions";
import type { NotificationItem, StarLedgerRow, StarsOverview } from "./types";

const ledgerColumns: Column<StarLedgerRow>[] = [
  { key: "date", header: "التاريخ", cell: (r) => <span className="num">{formatDateTime(r.createdAt)}</span> },
  { key: "reason", header: "السبب", cell: (r) => r.reason },
  {
    key: "amount",
    header: "العدد",
    numeric: true,
    cell: (r) => (
      <Badge tone={r.amount >= 0 ? "success" : "danger"} className="num">
        {r.amount >= 0 ? "+" : "−"}
        {formatNumber(Math.abs(r.amount))}
      </Badge>
    ),
  },
  { key: "after", header: "الرصيد بعد الحركة", numeric: true, cell: (r) => (typeof r.balanceAfter === "number" ? <span className="num">{formatNumber(r.balanceAfter)}</span> : "—") },
  { key: "ref", header: "المرجع", cell: (r) => (r.reference ? <span className="ltr-isolate num text-xs">{r.reference}</span> : "—") },
];

/** Balance + movement log. Read-only by design: the UI can never change a balance. */
export function StarsView({ data, caption }: { data: StarsOverview; caption?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <StarBalance balance={data.balance} caption={caption} className="max-w-md" />
      <p className="text-sm text-ink-muted">
        رصيدك الحالي: {starsLabel(data.balance)}. تُسجَّل كل حركة (إضافة أو خصم) هنا ولا يمكن تعديلها.
      </p>
      <DataTable
        caption="سجل حركات النجوم"
        columns={ledgerColumns}
        rows={data.ledger}
        rowKey={(r) => r.id}
        empty={<EmptyState icon="star" title="لا توجد حركات بعد">ستظهر هنا أول حركة عند شحن النجوم أو استخدامها.</EmptyState>}
      />
    </div>
  );
}

/** Switches for the kinds of notification a user may turn off. Orders, payments, refunds and plan notices are always sent. */
async function NotificationPrefs() {
  const { user } = await requireUser();
  const muted = new Set(await listMyMutedGroups(user));
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-bold">تحكّم في الإشعارات</h2>
      <p className="text-xs text-ink-muted">إشعارات الطلبات والدفع والاستردادات والباقات تصلك دائماً ولا يمكن إيقافها.</p>
      <ul className="flex flex-col divide-y divide-line">
        {MUTABLE_GROUPS.map((g) => (
          <li key={g.key}>
            <form action={setMuteAction} className="flex items-center justify-between gap-3 py-2">
              <input type="hidden" name="group" value={g.key} />
              <input type="hidden" name="muted" value={muted.has(g.key) ? "0" : "1"} />
              <span className="text-sm">{g.label}</span>
              <Button type="submit" size="sm" variant={muted.has(g.key) ? "primary" : "outline"}>{muted.has(g.key) ? "موقوفة · تشغيل" : "إيقاف"}</Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export async function NotificationsView({ items }: { items: NotificationItem[] }) {
  if (items.length === 0) return <div className="flex flex-col gap-3"><EmptyState icon="bell" title="لا توجد إشعارات">ستصلك هنا تنبيهات الطلبات والباقات.</EmptyState><NotificationPrefs /></div>;
  const unread = items.some((n) => !n.read);
  return (
    <div className="flex flex-col gap-3">
      <NotificationPrefs />
      {unread ? (
        <form action={markAllReadAction}>
          <Button type="submit" size="sm" variant="outline">تعليم الكل كمقروء</Button>
        </form>
      ) : null}
    <ul className="flex flex-col gap-3">
      {items.map((n) => (
        <li key={n.id}>
          <Card className={cn("flex flex-col gap-1", !n.read && "border-brand/40 bg-brand-soft/30")}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">{n.title}</h3>
              {!n.read ? <Badge tone="info">جديد</Badge> : null}
            </div>
            <p className="text-sm text-ink-muted">{n.body}</p>
            <p className="num text-xs text-ink-faint">{formatDateTime(n.createdAt)}</p>
          </Card>
        </li>
      ))}
    </ul>
    </div>
  );
}
