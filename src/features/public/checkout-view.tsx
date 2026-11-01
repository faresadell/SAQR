"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/link-button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { placeOrderAction } from "@/features/customer/actions";
import { useCart } from "@/features/cart/cart-provider";
import { groupByMerchant } from "@/features/cart/cart-state";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";

export interface CheckoutAddress {
  id: string;
  label: string;
  line: string;
  zoneName?: string | undefined;
}

interface CheckoutViewProps {
  signedIn: boolean;
  /** Current admin-configured star rules (minimum balance to start vs. cost per order). Null = unknown, show no numbers. */
  starRules?: { minBalance: number; chargePerOrder: number } | null;
  /** The signed-in customer's saved addresses (empty for guests). */
  addresses?: CheckoutAddress[];
}

/**
 * Checkout review. It shows what will be sent (items per merchant) and keeps delivery fees separate.
 * Totals and the delivery fee are decided by the server; the order only exists once the server accepts it.
 */
export function CheckoutView({ signedIn, starRules, addresses = [] }: CheckoutViewProps) {
  const { lines, hydrated, dispatch } = useCart();
  const router = useRouter();
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One key per attempt-set: retrying after a network error must not create a second order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await placeOrderAction({
        idempotencyKey,
        addressId,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, expectedUnitPriceCents: l.priceCents })),
      });
      if (result.ok) {
        dispatch({ type: "clear" });
        router.push(`/account/orders/${result.parentOrderId}`);
        return;
      }
      if (result.prices) dispatch({ type: "reprice", prices: result.prices });
      setError(result.error);
    });
  }

  if (!hydrated) return <Skeleton className="h-64" />;
  if (lines.length === 0) {
    return (
      <EmptyState icon="cart" title="لا توجد عناصر لتأكيدها" action={<LinkButton href="/explore">استكشف الأنشطة</LinkButton>}>
        أضف منتجات إلى السلة أولاً.
      </EmptyState>
    );
  }
  const groups = groupByMerchant(lines);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">عنوان التوصيل</h2>
          {!signedIn ? (
            <p className="text-sm text-ink-muted">سجّل الدخول لاختيار عنوان التوصيل.</p>
          ) : addresses.length === 0 ? (
            <>
              <Notice tone="warning">لا يوجد عنوان محفوظ. أضف عنواناً لتتمكن من تأكيد الطلب.</Notice>
              <LinkButton href="/account/addresses" variant="outline" className="w-fit">إضافة عنوان</LinkButton>
            </>
          ) : (
            <>
              <Select label="اختر العنوان" name="addressId" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                {addresses.map((a) => <option key={a.id} value={a.id}>{a.label}{a.zoneName ? ` — ${a.zoneName}` : ""} — {a.line}</option>)}
              </Select>
              <p className="text-xs text-ink-muted">رسوم التوصيل تُحسب على الخادم حسب المنطقة وتظهر في صفحة الطلب بعد التأكيد.</p>
            </>
          )}
        </Card>

        {groups.map((g) => (
          <Card key={g.merchantId} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">{g.merchantName}</h3>
              <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-muted">طلب فرعي مستقل</span>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {g.lines.map((l) => (
                <li key={l.productId} className="flex items-center justify-between gap-3">
                  <span>{l.name} <span className="num text-ink-muted">× {formatNumber(l.quantity)}</span></span>
                  <span className="num font-semibold">{formatEgp(l.priceCents * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line pt-2 text-sm">
              <span className="text-ink-muted">منتجات هذا النشاط</span>
              <span className="num font-bold">{formatEgp(g.subtotalCents)}</span>
            </div>
            <p className="text-xs text-ink-muted">يُدفع لهذا النشاط بتحويل مستقل، ويُرفع له إيصال خاص به.</p>
          </Card>
        ))}
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <h2 className="text-lg font-bold">قبل التأكيد</h2>
        {starRules ? (
          <Notice tone="info">
            يلزم رصيد لا يقل عن <strong className="num">{formatNumber(starRules.minBalance)}</strong> نجوم لبدء الطلب، وتكلفة كل طلب{" "}
            <strong className="num">{formatNumber(starRules.chargePerOrder)}</strong> نجمة. هذه تكلفة النجوم فقط، منفصلة عن ثمن المنتجات ورسوم التوصيل، ولا تُخصم إلا بعد موافقة التاجر وتأكيد الخادم.
          </Notice>
        ) : null}
        <dl className="flex flex-col gap-2 text-sm">
          {groups.map((g) => (
            <div key={g.merchantId} className="flex items-center justify-between gap-3">
              <dt className="truncate text-ink-muted">{g.merchantName}</dt>
              <dd className="num font-semibold">{formatEgp(g.subtotalCents)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
            <dt className="text-ink-muted">رسوم التوصيل</dt>
            <dd className="text-xs font-semibold text-ink-muted">يحددها النظام</dd>
          </div>
        </dl>

        {!signedIn ? (
          <>
            <Notice tone="warning">سجّل الدخول بحساب عميل لتأكيد الطلب. سلتك محفوظة على هذا الجهاز.</Notice>
            <LinkButton href="/login" size="lg">تسجيل الدخول</LinkButton>
            <p className="text-center text-sm text-ink-muted">
              ليس لديك حساب؟ <Link href="/register" className="font-semibold text-brand underline">إنشاء حساب</Link>
            </p>
          </>
        ) : (
          <>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button size="lg" className="w-full" loading={pending} disabled={!addressId} onClick={confirm}>تأكيد الطلب</Button>
          </>
        )}
      </aside>
    </div>
  );
}
