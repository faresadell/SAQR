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
import { checkCouponAction, placeOrderAction, type CouponCheckResult } from "@/features/customer/actions";
import { couponDiscounts } from "@/lib/coupons/discount";
import { Field } from "@/components/ui/field";
import { useCart } from "@/features/cart/cart-provider";
import { groupByMerchant } from "@/features/cart/cart-state";
import { formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";

export interface CheckoutAddress {
  id: string;
  label: string;
  line: string;
  zoneName?: string | undefined;
  /** Delivery fee per shop for this address today; null when the zone is closed. */
  feeCents: number | null;
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
  const [codeText, setCodeText] = useState("");
  const [coupon, setCoupon] = useState<Extract<CouponCheckResult, { ok: true }> | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const chosenAddress = addresses.find((a) => a.id === addressId);
  // One key per attempt-set: retrying after a network error must not create a second order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  function applyCoupon(merchantIds: string[]) {
    setCouponError(null);
    startCheck(async () => {
      const r = await checkCouponAction(codeText, merchantIds);
      if (r.ok) setCoupon(r);
      else {
        setCoupon(null);
        setCouponError(r.error);
      }
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await placeOrderAction({
        idempotencyKey,
        addressId,
        ...(coupon ? { couponCode: coupon.code } : {}),
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
  // A preview from the cart prices on screen. The server decides the real discount when the order is placed.
  const off = coupon ? couponDiscounts(coupon, groups) : new Map<string, number>();
  const totalOff = [...off.values()].reduce((n, v) => n + v, 0);

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
              {chosenAddress && chosenAddress.feeCents === null ? <Notice tone="danger">منطقة هذا العنوان غير متاحة للتوصيل الآن. اختر عنواناً آخر.</Notice> : <p className="text-xs text-ink-muted">سعر التوصيل بيحدده السائق بعد ما ياخد طلبك، وانت بتوافق عليه قبل الاستلام وتدفعه له كاش.</p>}
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
          {totalOff > 0 ? (
            <div className="flex items-center justify-between gap-3 text-success">
              <dt>خصم الكوبون <span dir="ltr" className="font-semibold">{coupon?.code}</span></dt>
              <dd className="num font-semibold">− {formatEgp(totalOff)}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
            <dt className="text-ink-muted">رسوم التوصيل (متوقعة)</dt>
            <dd className="num font-semibold">{chosenAddress && chosenAddress.feeCents ? formatEgp(chosenAddress.feeCents * groups.length) : <span className="text-xs text-ink-muted">{chosenAddress ? "يحدده السائق (كاش)" : "اختر عنواناً"}</span>}</dd>
          </div>
          {chosenAddress && chosenAddress.feeCents !== null ? (
            <div className="flex items-center justify-between gap-3 text-base">
              <dt className="font-bold">الإجمالي المتوقع</dt>
              <dd className="num font-bold">{formatEgp(groups.reduce((n, g) => n + g.subtotalCents, 0) - totalOff + chosenAddress.feeCents * groups.length)}</dd>
            </div>
          ) : null}
        </dl>

        {signedIn ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label="كود خصم (اختياري)" name="coupon" dir="ltr" value={codeText} maxLength={20} onChange={(e) => { setCodeText(e.target.value.toUpperCase()); setCoupon(null); }} />
              </div>
              <Button type="button" variant="secondary" loading={checking} disabled={codeText.trim().length < 4} onClick={() => applyCoupon(groups.map((g) => g.merchantId))}>تطبيق</Button>
            </div>
            {coupon && totalOff > 0 ? <p className="text-sm font-semibold text-success">تم تطبيق الكوبون. التوصيل لا يشمله الخصم (يُدفع للمندوب كاش).</p> : null}
            {coupon && totalOff === 0 ? <Notice tone="warning">الكوبون صالح لكن لا ينطبق على منتجات سلتك.</Notice> : null}
            {couponError ? <Notice tone="danger">{couponError}</Notice> : null}
          </div>
        ) : null}

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
            <Button size="lg" className="w-full" loading={pending} disabled={!addressId || chosenAddress?.feeCents === null} onClick={confirm}>تأكيد الطلب</Button>
          </>
        )}
      </aside>
    </div>
  );
}
