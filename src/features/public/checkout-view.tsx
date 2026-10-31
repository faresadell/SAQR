"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/features/cart/cart-provider";
import { groupByMerchant } from "@/features/cart/cart-state";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";

interface CheckoutViewProps {
  signedIn: boolean;
  /** Current admin-configured star rules (minimum balance to start vs. cost per order). Null = unknown, show no numbers. */
  starRules?: { minBalance: number; chargePerOrder: number } | null;
  /** Rendered in place of the confirm button's explanation when the server cannot create orders yet. */
  unavailableNote: ReactNode;
  /** When the backend exists, a server action is passed here and the confirm button submits it. */
  confirmAction?: () => Promise<void>;
}

/**
 * Checkout review. It shows exactly what would be sent (items per merchant) and keeps delivery fees separate.
 * It never computes final totals or confirms anything locally: confirmation depends on the server response.
 */
export function CheckoutView({ signedIn, starRules, unavailableNote, confirmAction }: CheckoutViewProps) {
  const { lines, hydrated } = useCart();

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
          <p className="text-sm text-ink-muted">اختيار العنوان وحساب رسوم التوصيل حسب المنطقة تتمّان عند تفعيل خدمة العناوين. لن نضع رسماً من عندنا.</p>
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
        ) : confirmAction ? (
          <form action={confirmAction}>
            <Button type="submit" size="lg" className="w-full">تأكيد الطلب</Button>
          </form>
        ) : (
          <>
            <Notice tone="info">{unavailableNote}</Notice>
            <Button size="lg" disabled className="w-full">تأكيد الطلب</Button>
          </>
        )}
      </aside>
    </div>
  );
}
