import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DriverStatus } from "@/server/drivers/service";
import { vehicleLabel } from "@/lib/vehicle";
import { setAvailabilityAction } from "./availability-actions";

const STATUS = { AVAILABLE: { label: "متاح للعمل", tone: "success" }, ON_TRIP: { label: "في مشوار", tone: "warning" }, OFFLINE: { label: "غير متاح", tone: "neutral" } } as const;

/** The driver's own status. «في مشوار» is automatic while they hold an order; the switch only turns availability on or off. */
export function AvailabilityCard({ status, isOnline, vehicleType }: { status: DriverStatus; isOnline: boolean; vehicleType: string }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold">حالتك</h2>
        <div className="flex flex-wrap gap-2"><Badge tone={STATUS[status].tone} className="w-fit">{STATUS[status].label}</Badge><Badge tone="neutral" className="w-fit">{vehicleLabel(vehicleType)}</Badge></div>
        <p className="text-xs text-ink-muted">التجار يشوفون حالتك ويبعتولك الطلبات وانت «متاح». تتحول لـ «في مشوار» تلقائياً لما تستلم طلب.</p>
      </div>
      <form action={setAvailabilityAction}>
        <input type="hidden" name="online" value={isOnline ? "false" : "true"} />
        <Button type="submit" variant={isOnline ? "outline" : "primary"}>{isOnline ? "إيقاف الاستقبال" : "متاح للعمل"}</Button>
      </form>
    </Card>
  );
}
