import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ORDER_STATUS } from "@/features/shared/status";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { STALE_MINUTES, type Monitoring } from "@/server/platform/monitoring";
import { DailyBars } from "./bars";

const ATTENTION = (a: Monitoring["attention"]) =>
  [
    { n: a.merchantsPending, label: "تجار بانتظار المراجعة", href: "/admin/merchants" },
    { n: a.complaintsOpen, label: "شكاوى مفتوحة", href: "/admin/complaints" },
    { n: a.refundsOpen, label: "استردادات لم تكتمل", href: "/admin/complaints" },
    { n: a.merchantSlow, label: `طلبات لم يردّ عليها التاجر منذ أكثر من ${STALE_MINUTES.AWAITING_MERCHANT_APPROVAL} دقيقة`, href: "/admin/orders" },
    { n: a.paymentUnconfirmed, label: `مدفوعات لم يؤكدها التاجر منذ أكثر من ${STALE_MINUTES.PAYMENT_CONFIRMATION / 60} ساعة`, href: "/admin/orders" },
    { n: a.noDriver, label: `طلبات جاهزة بلا مندوب منذ أكثر من ${STALE_MINUTES.NO_DRIVER} دقيقة`, href: "/admin/orders" },
    { n: a.unpaid, label: "طلبات لم يُرسَل لها إيصال منذ أكثر من يوم", href: "/admin/orders" },
  ] as const;

export function MonitoringView({ m }: { m: Monitoring }) {
  const items = ATTENTION(m.attention);
  const open = items.filter((i) => i.n > 0);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">تحتاج متابعة الآن</h2>
        {open.length === 0 ? (
          <p className="text-sm text-success">لا يوجد شيء متأخر حالياً.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {open.map((i) => (
              <li key={i.label}>
                <Link href={i.href} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand">
                  <span>{i.label}</span>
                  <span className="num rounded-full bg-warning-soft px-2.5 py-0.5 font-bold text-warning-ink">{formatNumber(i.n)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="طلبات مسلّمة (30 يوماً)" icon="box" value={formatNumber(m.deliveredOrders)} />
        <StatCard label="مبيعات المنتجات" icon="wallet" tone="success" value={formatEgp(m.salesCents)} note="بعد العروض والكوبونات" />
        <StatCard label="ملغاة/مرفوضة" icon="x" tone={m.cancelRatePercent !== null && m.cancelRatePercent >= 20 ? "danger" : "warning"} value={formatNumber(m.cancelledOrders)} note={m.cancelRatePercent === null ? undefined : `${formatNumber(m.cancelRatePercent)}% من المنتهية`} />
        <StatCard label="خصم كوبونات المنصة" icon="tag" tone="neutral" value={formatEgp(m.platformCouponCents)} note="مستحق للتجار على المنصة (كل الفترة)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h2 className="font-bold">الطلبات المسلّمة يومياً</h2>
          <DailyBars days={m.daily} metric="count" label="طلبات مسلّمة" />
        </Card>
        <Card className="flex flex-col gap-2">
          <h2 className="font-bold">الطلبات المفتوحة الآن</h2>
          {m.openByStatus.length === 0 ? (
            <p className="text-sm text-ink-muted">لا توجد طلبات مفتوحة.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {m.openByStatus.map((o) => (
                <li key={o.status} className="flex items-center justify-between py-2 text-sm">
                  <span>{ORDER_STATUS[o.status as keyof typeof ORDER_STATUS]?.label ?? o.status}</span>
                  <span className="num font-bold">{formatNumber(o.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">تسجيلات جديدة (30 يوماً)</h2>
        <p className="text-sm">
          عملاء <span className="num font-bold">{formatNumber(m.newUsers.customers)}</span> · تجار <span className="num font-bold">{formatNumber(m.newUsers.merchants)}</span> · مناديب <span className="num font-bold">{formatNumber(m.newUsers.drivers)}</span>
        </p>
      </Card>
      <p className="text-xs text-ink-muted">كل الأرقام من الطلبات الفعلية بتوقيت القاهرة. حدود «متأخر» للمتابعة فقط وليست قواعد عمل.</p>
    </div>
  );
}
