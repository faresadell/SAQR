import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";
import { PurchasePanel } from "./purchase-panel";
import { PACKAGE_STATE } from "./status";
import type { CurrentPackage, PackageOption, PaymentInstruction } from "./types";
import type { FormState } from "@/lib/form-state";

interface PackagesViewProps {
  options: PackageOption[];
  current: CurrentPackage;
  instructions: PaymentInstruction[];
  purchaseAction?: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Extra line under the status, e.g. offer quota for merchants. */
  extra?: ReactNode;
}

/** Current package status + purchase request. Nothing here grants stars or activates a package; the platform does after approving payment. */
export function PackagesView({ options, current, instructions, purchaseAction, extra }: PackagesViewProps) {
  const info = PACKAGE_STATE[current.state];
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{current.packageName ? `باقتك: ${current.packageName}` : "باقتك الحالية"}</h2>
          <Badge tone={info.tone}>{info.label}</Badge>
        </div>
        {current.state === "ACTIVE" || current.state === "EXPIRED" ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {current.activatedAt ? (
              <div><dt className="text-ink-muted">تاريخ التفعيل</dt><dd className="num font-semibold">{formatDate(current.activatedAt)}</dd></div>
            ) : null}
            {current.expiresAt ? (
              <div><dt className="text-ink-muted">تاريخ الانتهاء</dt><dd className="num font-semibold">{formatDate(current.expiresAt)}</dd></div>
            ) : null}
            {typeof current.daysLeft === "number" && current.state === "ACTIVE" ? (
              <div><dt className="text-ink-muted">المتبقي</dt><dd className="num font-semibold">{formatNumber(current.daysLeft)} يوماً</dd></div>
            ) : null}
          </dl>
        ) : null}
        {extra}
        <p className="text-xs text-ink-muted">لا تُمنح النجوم ولا تُفعَّل الباقة إلا بعد أن تعتمد الإدارة عملية الدفع.</p>
      </Card>
      <PurchasePanel options={options} current={current} instructions={instructions} action={purchaseAction} />
    </div>
  );
}
