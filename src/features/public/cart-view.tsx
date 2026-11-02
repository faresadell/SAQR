"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import { Icon } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/features/cart/cart-provider";
import { MAX_LINE_QUANTITY, groupByMerchant } from "@/features/cart/cart-state";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";

/** Single multi-merchant cart. Each merchant keeps its own subtotal (and later its own sub-order). */
export function CartView() {
  const { lines, hydrated, dispatch } = useCart();

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="جاري تحميل السلة">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <EmptyState icon="cart" title="سلتك فارغة" action={<LinkButton href="/explore">استكشف الأنشطة</LinkButton>}>
        أضف منتجات من أي عدد من المطاعم والمحلات والعطارات، وسنجمعها لك في سلة واحدة.
      </EmptyState>
    );
  }

  const groups = groupByMerchant(lines);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <Card key={g.merchantId} className="flex flex-col gap-3 p-0">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <Link href={`/shops/${g.merchantId}`} className="flex items-center gap-2 font-bold hover:text-brand">
                <Icon name="store" className="size-4 text-ink-muted" />
                {g.merchantName}
              </Link>
              <button
                type="button"
                onClick={() => dispatch({ type: "removeMerchant", merchantId: g.merchantId })}
                className="text-sm font-semibold text-danger-ink hover:underline"
              >
                إزالة النشاط
              </button>
            </div>
            <ul className="flex flex-col divide-y divide-line px-4">
              {g.lines.map((l) => (
                <li key={l.productId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{l.name}</p>
                    <p className="num text-sm text-ink-muted">{formatEgp(l.priceCents)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center rounded-control border border-line-strong" role="group" aria-label={`كمية ${l.name}`}>
                      <button type="button" aria-label="تقليل الكمية" onClick={() => dispatch({ type: "setQuantity", productId: l.productId, quantity: l.quantity - 1 })} className="flex size-10 items-center justify-center">
                        <Icon name={l.quantity <= 1 ? "trash" : "minus"} className="size-4" />
                      </button>
                      <span className="num min-w-7 text-center font-bold">{formatNumber(l.quantity)}</span>
                      <button type="button" aria-label="زيادة الكمية" disabled={l.quantity >= MAX_LINE_QUANTITY} onClick={() => dispatch({ type: "setQuantity", productId: l.productId, quantity: l.quantity + 1 })} className="flex size-10 items-center justify-center disabled:opacity-40">
                        <Icon name="plus" className="size-4" />
                      </button>
                    </div>
                    <span className="num w-24 text-end font-bold">{formatEgp(l.priceCents * l.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between rounded-b-card bg-surface-muted px-4 py-3 text-sm">
              <span className="text-ink-muted">إجمالي منتجات {g.merchantName}</span>
              <span className="num font-bold">{formatEgp(g.subtotalCents)}</span>
            </div>
          </Card>
        ))}
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <h2 className="text-lg font-bold">ملخص السلة</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {groups.map((g) => (
            <li key={g.merchantId} className="flex items-center justify-between gap-3">
              <span className="truncate text-ink-muted">{g.merchantName}</span>
              <span className="num font-semibold">{formatEgp(g.subtotalCents)}</span>
            </li>
          ))}
        </ul>
        <Notice>
          الأسعار المعروضة هنا للمراجعة فقط. يؤكد النظام التوفر والأسعار النهائية، وتُحسب رسوم التوصيل منفصلة عن المنتجات عند تأكيد الطلب. لكل نشاط دفع وإيصال مستقلان.
        </Notice>
        <LinkButton href="/checkout" size="lg">متابعة إلى تأكيد الطلب</LinkButton>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "clear" })}>إفراغ السلة</Button>
      </aside>
    </div>
  );
}
