"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { formatEgp } from "@/lib/money";
import type { FormState } from "@/lib/form-state";
import { MethodFieldset, ProofFields } from "@/features/shared/payment-fields";
import type { PaymentInstruction } from "@/features/shared/types";

const idle: FormState = {};
const PRICE_PER_STAR_CENTS = 100;

/** Loose-star top-up for a merchant whose package ended: choose how many stars (1 EGP each), transfer, attach proof. */
export function TopUpPanel({ instructions, action, blocked }: { instructions: PaymentInstruction[]; action: (prev: FormState, formData: FormData) => Promise<FormState>; blocked: boolean }) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [stars, setStars] = useState("50");
  const [method, setMethod] = useState(instructions[0]?.methodCode ?? "");
  const errors = state.fieldErrors ?? {};
  const count = Number(stars);
  const valid = Number.isInteger(count) && count >= 1 && count <= 5000;
  const instruction = instructions.find((i) => i.methodCode === method);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">شحن نجوم بدون باقة</h2>
      <p className="text-sm text-ink-muted">النجمة بجنيه واحد. اكتب العدد الذي تريده، حوّل المبلغ، وارفع الإيصال. تضاف النجوم بعد مراجعة الإدارة ولا تجدّد الباقة.</p>
      {blocked ? <Notice tone="warning">لديك طلب قيد المراجعة. انتظر اعتماده قبل إرسال طلب آخر.</Notice> : null}
      {instructions.length === 0 ? (
        <Notice tone="warning">لا توجد وسيلة دفع مفعّلة حالياً. حاول لاحقاً.</Notice>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="عدد النجوم" name="stars" type="number" inputMode="numeric" min={1} max={5000} step={1} required value={stars} onChange={(e) => setStars(e.target.value)} disabled={blocked} error={errors.stars} />
          <MethodFieldset instructions={instructions} method={method} onChange={setMethod} disabled={blocked} />
          {instruction?.accountValue ? (
            <p className="rounded-control bg-canvas p-3 text-sm">
              حوّل {valid ? <strong className="num">{formatEgp(count * PRICE_PER_STAR_CENTS)}</strong> : "المبلغ"} إلى {instruction.accountLabel}: <strong className="ltr-isolate num">{instruction.accountValue}</strong>
            </p>
          ) : instruction ? (
            <Notice tone="warning">لم تحدّد الإدارة بعد رقم استلام الدفع لهذه الوسيلة.</Notice>
          ) : null}
          <ProofFields disabled={blocked} state={state} />
          <Button type="submit" loading={pending} disabled={blocked || !valid || !instruction?.accountValue}>إرسال للمراجعة</Button>
        </form>
      )}
    </Card>
  );
}
