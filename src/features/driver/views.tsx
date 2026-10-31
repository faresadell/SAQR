"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import { Icon } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { StatCard } from "@/components/ui/stat-card";
import { SlideToConfirm } from "@/components/saqr/slide-to-confirm";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { TripStop, TripView } from "@/features/shared/types";
import type { DriverHomeData } from "./data";
import { safeExternalUrl } from "./safe-url";

const KIND = { PICKUP: { label: "استلام", tone: "info" }, DROPOFF: { label: "تسليم", tone: "success" } } as const;

function StopCard({ stop, index, current }: { stop: TripStop; index: number; current: boolean }) {
  return (
    <li className={cn("flex gap-3 rounded-card border bg-surface p-4", current ? "border-brand shadow-card" : "border-line", stop.status === "DONE" && "opacity-70")}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", stop.status === "DONE" ? "bg-success text-white" : "bg-navy-900 text-white")}>
        {stop.status === "DONE" ? <Icon name="check" className="size-4" /> : <span className="num">{formatNumber(index + 1)}</span>}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold">{stop.title}</p>
          <Badge tone={KIND[stop.kind].tone}>{KIND[stop.kind].label}</Badge>
          {stop.status === "DONE" ? <Badge tone="success">تم</Badge> : null}
        </div>
        <p className="text-sm text-ink-muted">{stop.address}</p>
        <p className="num text-xs text-ink-faint">الطلبات: {stop.orderNumbers.map((n) => `#${formatNumber(n)}`).join("، ")}</p>
      </div>
    </li>
  );
}

/** Active trip: ordered pick-up and drop-off stops, details of the next stop, and slide-to-confirm. */
export function ActiveTripView({ trip, canAct = false }: { trip: TripView; canAct?: boolean }) {
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const nextIndex = trip.stops.findIndex((s) => s.status === "PENDING");
  const next = nextIndex >= 0 ? trip.stops[nextIndex] : undefined;
  const map = safeExternalUrl(next?.mapUrl);

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-3" aria-label="نقاط الرحلة">
        {trip.stops.map((s, i) => <StopCard key={s.id} stop={s} index={i} current={i === nextIndex} />)}
      </ol>

      {next ? (
        <Card className="flex flex-col gap-4 rounded-sheet">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{next.kind === "PICKUP" ? "الاستلام التالي" : "التسليم التالي"}</h2>
            <Badge tone={KIND[next.kind].tone}>{KIND[next.kind].label}</Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-muted">النقطة</dt><dd className="text-end font-semibold">{next.title}</dd>
            <dt className="text-ink-muted">العنوان</dt><dd className="text-end font-semibold">{next.address}</dd>
            <dt className="text-ink-muted">الطلبات</dt><dd className="num text-end font-semibold">{next.orderNumbers.map((n) => `#${formatNumber(n)}`).join("، ")}</dd>
            {next.note ? (<><dt className="text-ink-muted">ملاحظة</dt><dd className="text-end">{next.note}</dd></>) : null}
          </dl>
          {map ? (
            <a href={map} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-brand-soft font-semibold text-navy-700 hover:bg-brand/20">
              <Icon name="navigation" className="size-4" />
              فتح الاتجاهات
            </a>
          ) : (
            <p className="text-xs text-ink-muted">لا يوجد رابط خريطة صالح لهذه النقطة، ولا نعرض تتبعاً مباشراً.</p>
          )}
          <SlideToConfirm
            label={next.kind === "PICKUP" ? "اسحب لتأكيد الاستلام" : "اسحب لتأكيد التسليم"}
            disabled={!canAct}
            onConfirm={() => setConfirmed(next.id)}
          />
          {!canAct ? <Notice tone="info">تأكيد الاستلام والتسليم غير مفعّل بعد على الخادم.</Notice> : null}
          {confirmed === next.id ? <Notice tone="warning">لم يُسجَّل أي تأكيد: الحالة تتغير فقط بعد استجابة الخادم.</Notice> : null}
        </Card>
      ) : (
        <Notice tone="success">تمت كل النقاط. أنهِ الرحلة من الخادم عند تفعيلها.</Notice>
      )}
    </div>
  );
}

export function TripListView({ trips, emptyTitle, emptyText }: { trips: TripView[]; emptyTitle: string; emptyText: string }) {
  if (trips.length === 0) return <EmptyState icon="navigation" title={emptyTitle}>{emptyText}</EmptyState>;
  return (
    <ul className="flex flex-col gap-3">
      {trips.map((t) => {
        const pickups = t.stops.filter((s) => s.kind === "PICKUP").length;
        const drops = t.stops.length - pickups;
        return (
          <li key={t.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">رحلة <span className="num">{formatNumber(pickups)}</span> استلام · <span className="num">{formatNumber(drops)}</span> تسليم</p>
                <Badge tone={t.state === "COMPLETED" ? "success" : t.state === "AVAILABLE" ? "warning" : "info"}>
                  {{ AVAILABLE: "متاحة", ACCEPTED: "مقبولة", IN_PROGRESS: "جارية", COMPLETED: "مكتملة" }[t.state]}
                </Badge>
              </div>
              <p className="text-sm text-ink-muted">{t.stops.map((s) => s.title).join(" ← ")}</p>
              {t.endedAt ? <p className="num text-xs text-ink-faint">انتهت {formatDateTime(t.endedAt)}</p> : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

export function DriverHomeView({ data, base }: { data: DriverHomeData; base: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="مهام متاحة" icon="list" value={formatNumber(data.availableCount)} />
        <StatCard label="أنهيتها اليوم" icon="checkCircle" tone="success" value={formatNumber(data.completedToday)} />
        <StatCard label="رصيد النجوم" icon="star" tone="warning" value={formatNumber(data.starsBalance)} />
        <StatCard label="الرحلة الحالية" icon="navigation" tone="neutral" value={data.active ? "جارية" : "لا توجد"} />
      </div>
      {data.active ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">رحلتك الجارية</h2>
          <p className="text-sm text-ink-muted">{data.active.stops.filter((s) => s.status === "DONE").length} من {data.active.stops.length} نقاط مكتملة.</p>
          <LinkButton href={`${base}/trip`}>متابعة الرحلة</LinkButton>
        </Card>
      ) : (
        <EmptyState icon="navigation" title="لا توجد رحلة جارية" action={<LinkButton href={`${base}/tasks`}>عرض المهام المتاحة</LinkButton>}>
          اقبل مهمة من القائمة لتبدأ رحلتك.
        </EmptyState>
      )}
      <p className="text-xs text-ink-muted">لا تُخصم نجوم من السائق على الطلبات أو الرحلات.</p>
    </div>
  );
}
