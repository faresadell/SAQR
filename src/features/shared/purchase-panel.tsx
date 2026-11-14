"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { MethodFieldset, ProofFields } from "./payment-fields";
import { PackageCard } from "@/components/saqr/package-card";
import { formatEgp } from "@/lib/money";
import type { FormState } from "@/lib/form-state";
import type { CurrentPackage, PackageOption, PaymentInstruction } from "./types";

interface PurchasePanelProps {
  options: PackageOption[];
  current: CurrentPackage;
  instructions: PaymentInstruction[];
  /**
   * Server action that creates the purchase request (package id, method, reference, receipt file).
   * Absent until the backend provides it; then the form is shown read-only and cannot be submitted.
   */
  action?: (prev: FormState, formData: FormData) => Promise<FormState>;
}

const idle: FormState = {};
async function noop(prev: FormState): Promise<FormState> {
  return prev;
}

/**
 * Choose a package, see where to transfer, attach the receipt. A submitted request stays "قيد المراجعة"
 * until the platform approves it; nothing here grants stars or activates a package.
 */
export function PurchasePanel({ options, current, instructions, action }: PurchasePanelProps) {
  const [state, formAction, pending] = useActionState(action ?? noop, idle);
  const [selected, setSelected] = useState<string | null>(options[0]?.id ?? null);
  const [method, setMethod] = useState(instructions[0]?.methodCode ?? "");
  const chosen = options.find((o) => o.id === selected);
  const instruction = instructions.find((i) => i.methodCode === method);
  const blocked = current.state === "PENDING_REVIEW";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        {options.map((o) => (
          <PackageCard
            key={o.id}
            option={o}
            selected={selected === o.id}
            action={
              <Button type="button" variant={selected === o.id ? "primary" : "outline"} className="w-full" onClick={() => setSelected(o.id)} aria-pressed={selected === o.id}>
                {selected === o.id ? "تم الاختيار" : "اختيار الباقة"}
              </Button>
            }
          />
        ))}
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">الدفع ورفع الإيصال</h2>
        {blocked ? <Notice tone="warning">لديك طلب شراء قيد المراجعة. سنخبرك عند اعتماده ولا يمكن إرسال طلب آخر الآن.</Notice> : null}
        {instructions.length === 0 ? (
          <Notice tone="warning">لا توجد وسيلة دفع مفعّلة حالياً. حاول لاحقاً.</Notice>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="packageId" value={selected ?? ""} />
            <MethodFieldset instructions={instructions} method={method} onChange={setMethod} disabled={blocked} />
            {instruction?.accountValue ? (
              <p className="rounded-control bg-canvas p-3 text-sm">
                حوّل {chosen ? <strong className="num">{formatEgp(chosen.priceCents)}</strong> : "المبلغ"} إلى {instruction.accountLabel}:{" "}
                <strong className="ltr-isolate num">{instruction.accountValue}</strong>
              </p>
            ) : instruction ? (
              <Notice tone="warning">لم تحدّد الإدارة بعد رقم استلام الدفع لهذه الوسيلة، ولا يمكن إتمام الشراء بها قبل إعداده.</Notice>
            ) : null}
            <ProofFields disabled={blocked} state={state} />
            <Button type="submit" loading={pending} disabled={!action || blocked || !selected || !instruction?.accountValue}>إرسال للمراجعة</Button>
            <p className="text-xs text-ink-muted">بعد الإرسال تظهر الحالة «قيد المراجعة» حتى يعتمد النظام الدفع. الصورة وحدها ليست دليلاً نهائياً على نجاح الدفع.</p>
          </form>
        )}
      </Card>
    </div>
  );
}
