"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { approveLegalAction, saveLegalAction } from "./legal-actions";

export interface LegalRow {
  slug: string;
  title: string;
  body: string;
  version: number;
  approved: boolean;
}

const idle: FormState = {};
const LABEL: Record<string, string> = { terms: "الشروط والأحكام", privacy: "سياسة الخصوصية", cancellation: "سياسة الإلغاء", refund: "سياسة الاسترجاع", support: "الدعم", contest: "قواعد المسابقة" };

function LegalCard({ row }: { row: LegalRow }) {
  const [saveState, save, saving] = useActionState(saveLegalAction, idle);
  const [approveState, approve, approving] = useActionState(approveLegalAction, idle);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{LABEL[row.slug] ?? row.slug}</h2>
        <span className="flex gap-1.5 items-center">
          <span className="text-xs text-ink-muted">نسخة <span className="num">{row.version}</span></span>
          <Badge tone={row.approved ? "success" : "warning"}>{row.approved ? "معتمدة" : "مسودة غير معتمدة"}</Badge>
          <a className="text-sm font-semibold text-brand underline" href={`/legal/${row.slug}`} target="_blank" rel="noopener noreferrer">معاينة</a>
        </span>
      </div>
      <form action={save} className="flex flex-col gap-3">
        <input type="hidden" name="slug" value={row.slug} />
        <input type="hidden" name="version" value={row.version} />
        <Field label="العنوان" name="title" defaultValue={row.title} required maxLength={120} />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          النص
          <textarea name="body" defaultValue={row.body} required maxLength={20000} rows={10} className="rounded-control border border-line bg-surface p-3 font-normal leading-7" />
        </label>
        {saveState.error ? <Notice tone="danger">{saveState.error}</Notice> : null}
        {saveState.message ? <Notice tone="success">{saveState.message}</Notice> : null}
        <Button type="submit" loading={saving} className="w-fit">حفظ كنسخة جديدة</Button>
      </form>
      {!row.approved ? (
        <form action={approve} className="flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="slug" value={row.slug} />
          <input type="hidden" name="version" value={row.version} />
          <p className="text-xs text-ink-muted">اعتمد النسخة فقط بعد مراجعتها قانونياً. أي تعديل لاحق يلغي الاعتماد.</p>
          {approveState.error ? <Notice tone="danger">{approveState.error}</Notice> : null}
          {approveState.message ? <Notice tone="success">{approveState.message}</Notice> : null}
          <Button type="submit" variant="outline" loading={approving} className="w-fit">اعتماد النسخة {row.version}</Button>
        </form>
      ) : null}
    </Card>
  );
}

export function LegalPanel({ rows }: { rows: LegalRow[] }) {
  return <div className="flex flex-col gap-5">{rows.map((r) => <LegalCard key={r.slug} row={r} />)}</div>;
}
