import { BarChart } from "@/components/ui/bar-chart";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import type { SalesAnalytics } from "@/server/analytics/sales";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="num text-2xl font-bold">{value}</span>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </Card>
  );
}

export function SalesView({ a, rating }: { a: SalesAnalytics; rating?: { average: number | null; count: number } }) {
  const shortDay = (d: string) => d.slice(5).replace("-", "/");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">آخر {formatNumber(a.days)} يوماً، حسب تاريخ إنشاء الطلب. الأرقام من الطلبات الفعلية فقط. الإيراد = المنتجات بعد الكوبونات في الطلبات المستلمة.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="الإيراد" value={formatEgp(a.revenueCents)} />
        <Stat label="طلبات مستلمة" value={formatNumber(a.delivered)} hint={`من ${formatNumber(a.orders)} طلب`} />
        <Stat label="متوسط قيمة الطلب" value={a.averageOrderCents === null ? "—" : formatEgp(a.averageOrderCents)} />
        <Stat label="ملغاة أو مرفوضة" value={formatNumber(a.cancelled)} hint={a.orders ? `${formatNumber(Math.round((a.cancelled / a.orders) * 100))}% من الطلبات` : undefined} />
        <Stat label="طلبات جارية" value={formatNumber(a.open)} />
        <Stat label="عملاء استلموا طلباتهم" value={formatNumber(a.customers)} hint={`${formatNumber(a.returningCustomers)} منهم طلبوا أكثر من مرة`} />
        <Stat label="طلبات بكوبون" value={formatNumber(a.couponOrders)} hint={a.couponOrders ? `خصم ${formatEgp(a.couponDiscountCents)}` : undefined} />
        {rating ? <Stat label="تقييم العملاء" value={rating.average === null ? "—" : `${rating.average} / 5`} hint={rating.count ? `${formatNumber(rating.count)} تقييم` : "لا توجد تقييمات بعد"} /> : null}
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">الطلبات يومياً</h2>
        <BarChart label="عدد الطلبات" points={a.daily.map((d) => ({ key: d.day, value: d.orders, caption: shortDay(d.day) }))} format={(n) => formatNumber(n)} />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">الإيراد يومياً</h2>
        <BarChart label="الإيراد" points={a.daily.map((d) => ({ key: d.day, value: d.revenueCents, caption: shortDay(d.day) }))} format={(n) => formatEgp(n)} />
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">الأكثر مبيعاً</h2>
        {a.topProducts.length === 0 ? (
          <p className="text-sm text-ink-muted">لا توجد مبيعات مستلمة في هذه الفترة.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {a.topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate"><span className="num text-ink-muted">{formatNumber(i + 1)}.</span> {p.name}</span>
                <span className="num shrink-0">{formatNumber(p.units)} قطعة · {formatEgp(p.revenueCents)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
