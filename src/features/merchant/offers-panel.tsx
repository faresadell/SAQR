"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { EmptyState, Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { createOfferAction, extendOfferAction, stopOfferAction } from "./offer-actions";
import type { MerchantOfferRow, MerchantOffersData } from "./types";

const idle: FormState = {};
const STATE = { ACTIVE: { label: "نشط", tone: "success" }, EXPIRED: { label: "منتهٍ", tone: "neutral" }, STOPPED: { label: "موقوف", tone: "warning" } } as const;

function CreateOffer({ data }: { data: MerchantOffersData }) {
  const [state, action, pending] = useActionState(createOfferAction, idle);
  const [type, setType] = useState("");
  const d = data.discounts;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">نشر عرض جديد</h2>
      <p className="text-sm text-ink-muted">يستمر العرض <strong className="num">{formatNumber(data.baseHours)}</strong> ساعة، ويمكنك تمديده بالنجوم.</p>
      <form action={action} className="flex flex-col gap-3">
        <Field label="عنوان العرض" name="title" required minLength={3} maxLength={80} error={state.fieldErrors?.title} />
        <Field label="وصف (اختياري)" name="description" maxLength={500} />
        {d.enabled ? (
          <>
            <Select label="نوع الخصم" name="discountType" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">بدون خصم (إعلان فقط)</option>
              <option value="PERCENT">نسبة مئوية (حتى {formatNumber(d.maxPercent)}%)</option>
              <option value="FIXED">مبلغ ثابت لكل وحدة (حتى {formatNumber(d.maxFixedEgp)} جنيه)</option>
            </Select>
            {type ? (
              <>
                <Field label={type === "PERCENT" ? "نسبة الخصم %" : "قيمة الخصم بالجنيه لكل وحدة"} name="discountValue" inputMode="decimal" required error={state.fieldErrors?.discountValue} hint={`حد أقصى ${formatNumber(d.maxActive)} عروض بخصم في نفس الوقت.`} />
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1 text-sm font-semibold">المنتجات المشمولة</legend>
                  {data.products.length === 0 ? <p className="text-sm text-ink-muted">لا توجد منتجات متاحة.</p> : data.products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="productIds" value={p.id} /> {p.name} <span className="num text-ink-muted">({formatEgp(p.priceCents)})</span>
                    </label>
                  ))}
                </fieldset>
                <p className="text-xs text-ink-muted">الخصم يؤثر على الطلبات الجديدة فقط، ولا يغيّر الطلبات السابقة.</p>
              </>
            ) : null}
          </>
        ) : (
          <Notice tone="info">الخصومات غير مفعّلة حالياً من الإدارة. يمكنك نشر عرض إعلاني بدون خصم.</Notice>
        )}
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <Button type="submit" loading={pending} className="w-fit">نشر العرض</Button>
      </form>
    </Card>
  );
}

function OfferCard({ offer, perHour }: { offer: MerchantOfferRow; perHour: number }) {
  const [extendState, extend, extending] = useActionState(extendOfferAction, idle);
  const [stopState, stop, stopping] = useActionState(stopOfferAction, idle);
  const [key] = useState(() => crypto.randomUUID());
  const info = STATE[offer.state];
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{offer.title}</h3>
        <span className="flex gap-1.5">{offer.discountLabel ? <Badge tone="success">{offer.discountLabel}</Badge> : null}<Badge tone={info.tone}>{info.label}</Badge></span>
      </div>
      {offer.description ? <p className="text-sm text-ink-muted">{offer.description}</p> : null}
      <p className="text-xs text-ink-muted">ينتهي: <span className="num">{formatDateTime(offer.endsAt)}</span></p>
      {offer.state === "ACTIVE" ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-2">
          <form action={extend} className="flex items-end gap-2">
            <input type="hidden" name="offerId" value={offer.id} />
            <input type="hidden" name="idempotencyKey" value={key} />
            <Field label="تمديد (ساعات)" name="hours" type="number" min={1} max={1000} defaultValue={1} required className="w-24" />
            <Button type="submit" size="sm" loading={extending}>تمديد ({formatNumber(perHour)} نجمة/ساعة)</Button>
          </form>
          <form action={stop} className="flex items-end gap-2">
            <input type="hidden" name="offerId" value={offer.id} />
            <Button type="submit" size="sm" variant="danger" loading={stopping}>إيقاف العرض</Button>
          </form>
        </div>
      ) : null}
      {extendState.error ? <Notice tone="danger">{extendState.error}</Notice> : null}
      {extendState.message ? <Notice tone="success">{extendState.message}</Notice> : null}
      {stopState.error ? <Notice tone="danger">{stopState.error}</Notice> : null}
    </Card>
  );
}

/** Real offers: publish, extend with stars (idempotent), stop. Discount limits come from admin settings. */
export function MerchantOffersPanel({ data }: { data: MerchantOffersData }) {
  const active = data.offers.filter((o) => o.state === "ACTIVE");
  const past = data.offers.filter((o) => o.state !== "ACTIVE");
  return (
    <div className="flex flex-col gap-6">
      <CreateOffer data={data} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">العروض الجارية</h2>
        {active.length === 0 ? <EmptyState icon="tag" title="لا توجد عروض جارية">انشر عرضاً ليظهر للعملاء في صفحة العروض.</EmptyState> : active.map((o) => <OfferCard key={o.id} offer={o} perHour={data.extensionStarsPerHour} />)}
      </section>
      {past.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">سجل العروض</h2>
          {past.map((o) => <OfferCard key={o.id} offer={o} perHour={data.extensionStarsPerHour} />)}
        </section>
      ) : null}
    </div>
  );
}
