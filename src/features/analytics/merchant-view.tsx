import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import type { MerchantAnalytics } from "@/server/analytics/merchant";
import { DailyBars } from "./bars";

export function MerchantAnalyticsView({ a }: { a: MerchantAnalytics }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="طلبات مسلّمة" icon="box" value={formatNumber(a.deliveredOrders)} />
        <StatCard label="مبيعات المنتجات" icon="wallet" tone="success" value={formatEgp(a.salesCents)} note={a.couponDiscountCents > 0 ? `بعد خصم كوبونات ${formatEgp(a.couponDiscountCents)}` : "بعد العروض"} />
        <StatCard label="متوسط الطلب" icon="tag" value={a.averageOrderCents === null ? "—" : formatEgp(a.averageOrderCents)} />
        <StatCard label="طلبات ملغاة/مرفوضة" icon="x" tone={a.cancelRatePercent && a.cancelRatePercent >= 20 ? "danger" : "warning"} value={formatNumber(a.cancelledOrders)} note={a.cancelRatePercent === null ? undefined : `${formatNumber(a.cancelRatePercent)}% من الطلبات المنتهية`} />
      </div>
      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">المبيعات يومياً</h2>
        <DailyBars days={a.daily} metric="cents" label="مبيعات المنتجات" />
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">الأكثر مبيعاً</h2>
        {a.topProducts.length === 0 ? (
          <p className="text-sm text-ink-muted">لا توجد بيانات بعد.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {a.topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate"><span className="num text-ink-muted">{i + 1}.</span> {p.name}</span>
                <span className="shrink-0"><span className="num font-semibold">{formatNumber(p.quantity)}</span> قطعة · <span className="num">{formatEgp(p.cents)}</span></span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card className="flex items-center justify-between gap-3">
        <h2 className="font-bold">تقييم العملاء</h2>
        <p className="text-sm">{a.rating.average === null ? "لا توجد تقييمات بعد" : <><span className="num font-bold">{a.rating.average}</span> من 5 · <span className="num">{a.rating.count}</span> تقييم</>}</p>
      </Card>
      <p className="text-xs text-ink-muted">الأرقام من الطلبات المسلّمة فعلياً في آخر {a.days} يوماً (بتوقيت القاهرة). التوصيل لا يُحسب في المبيعات لأنه كاش للمندوب.</p>
    </div>
  );
}
