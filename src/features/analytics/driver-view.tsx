import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import type { DriverAnalytics } from "@/server/analytics/driver";
import { DailyBars } from "./bars";

export function DriverAnalyticsView({ a }: { a: DriverAnalytics }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="توصيلات مكتملة" icon="truck" value={formatNumber(a.deliveries)} />
        <StatCard label="رسوم التوصيل" icon="wallet" tone="success" value={formatEgp(a.feesCents)} note="المتفق عليها مع العملاء" />
        <StatCard label="تم تحصيلها" icon="check" tone="success" value={formatEgp(a.collectedCents)} note={a.feesCents > a.collectedCents ? `${formatEgp(a.feesCents - a.collectedCents)} لم تُسجَّل كمحصّلة بعد` : undefined} />
        <StatCard label="متوسط زمن التوصيل" icon="clock" value={a.averageMinutes === null ? "—" : `${formatNumber(a.averageMinutes)} دقيقة`} note="من الاستلام للتسليم" />
      </div>
      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">التوصيلات يومياً</h2>
        <DailyBars days={a.daily} metric="count" label="عدد التوصيلات" />
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">الرسوم يومياً</h2>
        <DailyBars days={a.daily} metric="cents" label="رسوم التوصيل" />
      </Card>
    </div>
  );
}
