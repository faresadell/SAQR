"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { generateRecoveryAction, type RecoveryState } from "./security-actions";

const idle: RecoveryState = {};

export function SecurityPanel({ unused }: { unused: number }) {
  const [state, action, pending] = useActionState(generateRecoveryAction, idle);
  return (
    <Card className="flex max-w-xl flex-col gap-3">
      <h2 className="text-lg font-bold">رموز الاسترداد</h2>
      <p className="text-sm text-ink-muted">تحمل بها الدخول إن فقدت جهاز المصادقة. كل رمز يُستخدم مرة واحدة ولا يغني عن كلمة المرور. المتبقي غير المستخدم: <strong className="num">{unused}</strong>.</p>
      <Notice tone="warning">إنشاء مجموعة جديدة يُبطل القديمة فوراً. تظهر الرموز مرة واحدة فقط، فاحفظها في مكان آمن بعيداً عن هذا الجهاز.</Notice>
      <form action={action} className="flex flex-col gap-3">
        <Field label="كلمة المرور الحالية" name="password" type="password" autoComplete="current-password" required />
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        <Button type="submit" loading={pending} className="w-fit">إنشاء رموز جديدة</Button>
      </form>
      {state.codes ? (
        <ul className="grid grid-cols-2 gap-2 rounded-control bg-canvas p-3" aria-label="رموز الاسترداد">
          {state.codes.map((c) => <li key={c} className="ltr-isolate num font-mono text-sm font-bold">{c}</li>)}
        </ul>
      ) : null}
    </Card>
  );
}
