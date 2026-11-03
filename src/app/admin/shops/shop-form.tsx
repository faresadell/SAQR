"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/form-state";
import { createShopAction, updateShopAction } from "./actions";

const initial: FormState = {};
const areaClass = "min-h-20 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm";
const selectClass = "h-11 w-full rounded-control border border-line bg-surface px-3 text-sm";

export interface ShopFormValues {
  id?: string;
  name: string;
  description: string;
  businessType: string;
  phone: string;
  address: string;
  lat: string;
  lng: string;
  phones: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  whatsapp: string;
  website: string;
}

export const EMPTY_SHOP: ShopFormValues = { name: "", description: "", businessType: "", phone: "", address: "", lat: "", lng: "", phones: "", facebook: "", instagram: "", tiktok: "", whatsapp: "", website: "" };

/** One form for adding a shop (with an owner chosen from the list) and for editing any shop's details. */
export function ShopForm({ values, types, owners }: { values: ShopFormValues; types: { code: string; nameAr: string }[]; owners?: { id: string; name: string; phone: string }[] }) {
  const editing = Boolean(values.id);
  const [state, action, pending] = useActionState(editing ? updateShopAction : createShopAction, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {values.id ? <input type="hidden" name="merchantId" value={values.id} /> : null}
      {!editing ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="ownerId" className="text-sm font-semibold">صاحب النشاط</label>
          <select id="ownerId" name="ownerId" required defaultValue="" className={selectClass}>
            <option value="" disabled>اختر حساب تاجر</option>
            {(owners ?? []).map((o) => <option key={o.id} value={o.id}>{o.name} — {o.phone}</option>)}
          </select>
          <p className="text-xs text-ink-muted">حسابات التجار المفعّلة التي ليس لها نشاط. الطلبات تصل لهذا الحساب ويديرها من لوحته. {owners?.length === 0 ? "لا يوجد حساب متاح الآن: يسجّل صاحب النشاط حساب تاجر أولاً." : ""}</p>
          {e.owner ? <p role="alert" className="text-sm text-danger-ink">{e.owner}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم النشاط" name="name" defaultValue={values.name} required error={e.name} />
        <div className="flex flex-col gap-1">
          <label htmlFor="businessType" className="text-sm font-semibold">القسم</label>
          <select id="businessType" name="businessType" required defaultValue={values.businessType} className={selectClass}>
            <option value="" disabled>اختر القسم</option>
            {types.map((t) => <option key={t.code} value={t.code}>{t.nameAr}</option>)}
          </select>
          {e.businessType ? <p role="alert" className="text-sm text-danger-ink">{e.businessType}</p> : null}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-semibold">وصف مختصر</label>
        <textarea id="description" name="description" defaultValue={values.description} maxLength={500} className={areaClass} />
        {e.description ? <p role="alert" className="text-sm text-danger-ink">{e.description}</p> : null}
      </div>
      <Field label="العنوان" name="address" defaultValue={values.address} error={e.address} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="خط العرض (اختياري)" name="lat" dir="ltr" defaultValue={values.lat} error={e.location} />
        <Field label="خط الطول (اختياري)" name="lng" dir="ltr" defaultValue={values.lng} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="رقم النشاط الرئيسي (موبايل)" name="phone" type="tel" dir="ltr" defaultValue={values.phone} error={e.phone} />
        <div className="flex flex-col gap-1">
          <label htmlFor="phones" className="text-sm font-semibold">أرقام تواصل إضافية (رقم في كل سطر)</label>
          <textarea id="phones" name="phones" dir="ltr" defaultValue={values.phones} className={areaClass} />
          {e.contactPhones ? <p role="alert" className="text-sm text-danger-ink">{e.contactPhones}</p> : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="واتساب" name="whatsapp" type="tel" dir="ltr" defaultValue={values.whatsapp} error={e.whatsapp} />
        <Field label="فيسبوك (رابط)" name="facebook" dir="ltr" defaultValue={values.facebook} error={e.facebook} />
        <Field label="إنستجرام (رابط)" name="instagram" dir="ltr" defaultValue={values.instagram} error={e.instagram} />
        <Field label="تيك توك (رابط)" name="tiktok" dir="ltr" defaultValue={values.tiktok} error={e.tiktok} />
        <Field label="الموقع الإلكتروني" name="website" dir="ltr" defaultValue={values.website} error={e.website} />
      </div>
      {state.error ? <p role="alert" className="text-sm font-medium text-danger-ink">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-medium text-success-ink">{state.message}</p> : null}
      <Button type="submit" loading={pending} className="w-fit">{editing ? "حفظ التعديلات" : "إضافة النشاط"}</Button>
    </form>
  );
}

/** Uploads the shop picture to the admin image endpoint (kept off server actions: they cap the body at 1 MB). */
export function ShopImageUploader({ merchantId, hasImage }: { merchantId: string; hasImage: boolean }) {
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/v1/admin/shops/${merchantId}/image`, { method: "POST", body });
      if (res.ok) {
        setStatus({ tone: "ok", text: "تم رفع الصورة." });
        setVersion((v) => v + 1);
      } else setStatus({ tone: "bad", text: res.status === 415 ? "الملف ليس صورة صالحة (JPG أو PNG أو WebP)." : res.status === 413 ? "الصورة أكبر من 5 ميجابايت." : "تعذر رفع الصورة. حاول لاحقاً." });
    } catch {
      setStatus({ tone: "bad", text: "تعذر رفع الصورة. حاول لاحقاً." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">صورة النشاط</p>
      {hasImage || version > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/v1/shops/${merchantId}/image?v=${version}`} alt="" className="h-32 w-56 rounded-control border border-line object-cover" />
      ) : <p className="text-sm text-ink-muted">لا توجد صورة بعد. الصورة تظهر للعملاء بعد اعتماد النشاط.</p>}
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(ev) => void upload(ev.target.files?.[0])} aria-label="اختر صورة النشاط" />
      {status ? <p role="status" className={`text-sm font-medium ${status.tone === "ok" ? "text-success-ink" : "text-danger-ink"}`}>{status.text}</p> : null}
    </div>
  );
}
