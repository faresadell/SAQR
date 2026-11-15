"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { accountRowAction, addPaymentAccountAction } from "./payment-accounts-actions";

export interface AccountRow {
  id: string;
  method: string;
  methodLabel: string;
  accountValue: string;
  holderName: string | null;
  isActive: boolean;
}

const idle: FormState = {};

function RowButtons({ row }: { row: AccountRow }) {
  const [state, action, pending] = useActionState(accountRowAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="accountId" value={row.id} />
      <input type="hidden" name="active" value={String(!row.isActive)} />
      <Button type="submit" name="intent" value="toggle" variant="outline" size="sm" loading={pending}>{row.isActive ? "إيقاف" : "تفعيل"}</Button>
      <Button type="submit" name="intent" value="remove" variant="ghost" size="sm" disabled={pending}>حذف</Button>
      {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
    </form>
  );
}

/** The shop's receiving accounts: add as many as wanted; customers pick one when paying. */
export function PaymentAccountsPanel({ rows, methods }: { rows: AccountRow[]; methods: { code: string; label: string }[] }) {
  const [state, action, pending] = useActionState(addPaymentAccountAction, idle);
  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? <Notice tone="warning">لسه مفيش حساب. من غير حساب واحد على الأقل العملاء مش هيقدروا يطلبوا منك.</Notice> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{r.methodLabel}</strong>
                <span className={r.isActive ? "text-sm font-semibold text-success-ink" : "text-sm text-ink-muted"}>{r.isActive ? "ظاهر للعملاء" : "متوقف"}</span>
              </div>
              <p className="ltr-isolate num text-lg font-bold">{r.accountValue}</p>
              {r.holderName ? <p className="text-sm text-ink-muted">باسم {r.holderName}</p> : null}
              <RowButtons row={r} />
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <form action={action} className="flex flex-col gap-3" aria-label="إضافة حساب دفع">
          <h2 className="text-lg font-bold">إضافة حساب جديد</h2>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            وسيلة الدفع
            <select name="method" className="rounded-control border border-line bg-surface px-3 py-2.5" required>
              {methods.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </label>
          <Field label="رقم الحساب / عنوان الدفع" name="accountValue" dir="ltr" required />
          <Field label="الاسم على الحساب (اختياري)" name="holderName" maxLength={60} />
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
          {state.message ? <Notice tone="success">{state.message}</Notice> : null}
          <Button type="submit" loading={pending} disabled={methods.length === 0}>إضافة الحساب</Button>
        </form>
      </Card>
    </div>
  );
}
