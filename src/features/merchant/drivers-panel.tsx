"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { formatDate } from "@/lib/format";
import { createDriverAction, setDriverActiveAction } from "./driver-actions";

export interface DriverRow {
  id: string;
  name: string;
  phone: string;
  accountStatus: string;
  isActive: boolean;
  createdAt: string;
}

const idle: FormState = {};

export function DriversPanel({ drivers }: { drivers: DriverRow[] }) {
  const [state, action, pending] = useActionState(createDriverAction, idle);
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">إضافة سائق</h2>
        <p className="text-sm text-ink-muted">السائق يتبع نشاطك فقط. أعطه كلمة المرور المؤقتة، وسيؤكد رقمه بكود عند أول دخول.</p>
        <form action={action} className="flex flex-col gap-3">
          <Field label="الاسم" name="name" required minLength={2} maxLength={80} />
          <Field label="رقم الموبايل" name="phone" dir="ltr" inputMode="tel" required />
          <Field label="كلمة مرور مؤقتة" name="password" type="password" autoComplete="new-password" required minLength={8} />
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
          {state.message ? <Notice tone="success">{state.message}</Notice> : null}
          <Button type="submit" loading={pending} className="w-fit">إنشاء الحساب</Button>
        </form>
      </Card>
      {drivers.length === 0 ? (
        <EmptyState icon="truck" title="لا يوجد سائقون">أضف سائقاً لتتمكن من إسناد الطلبات للتوصيل.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">{d.name}</h3>
                  <Badge tone={d.isActive ? "success" : "warning"}>{d.isActive ? "نشط" : "موقوف"}</Badge>
                </div>
                <p className="ltr-isolate num text-sm text-ink-muted">{d.phone}</p>
                {d.accountStatus !== "ACTIVE" ? <p className="text-xs text-ink-muted">الحساب لم يُفعَّل بعد (بانتظار تأكيد الرقم).</p> : null}
                <p className="text-xs text-ink-muted">أُضيف في <span className="num">{formatDate(d.createdAt)}</span></p>
                <form action={setDriverActiveAction}>
                  <input type="hidden" name="driverId" value={d.id} />
                  <input type="hidden" name="isActive" value={d.isActive ? "false" : "true"} />
                  <Button type="submit" size="sm" variant="outline">{d.isActive ? "إيقاف مؤقت" : "استئناف"}</Button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
