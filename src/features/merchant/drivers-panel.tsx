import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

export interface DriverRow {
  id: string;
  name: string;
  status: "AVAILABLE" | "ON_TRIP" | "OFFLINE";
}

const STATUS = { AVAILABLE: { label: "متاح الآن", tone: "success" }, ON_TRIP: { label: "في مشوار", tone: "warning" }, OFFLINE: { label: "غير متاح", tone: "neutral" } } as const;

/** Independent drivers who are taking work. To send an order to one, use «إرسال للسائق» on the order itself. */
export function DriversPanel({ drivers }: { drivers: DriverRow[] }) {
  if (drivers.length === 0) {
    return <EmptyState icon="truck" title="لا يوجد سائق متاح الآن">السائقون يسجلون بأنفسهم ويفعّلون «متاح للعمل». ستظهر أسماؤهم هنا فور توفرهم.</EmptyState>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">لإرسال طلب لسائق: افتح الطلب من «الطلبات» واختر سائقاً متاحاً ثم «إرسال للسائق». السائق يقدر يتراجع قبل الاستلام.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {drivers.map((d) => (
          <li key={d.id}>
            <Card className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{d.name}</h3>
              <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
