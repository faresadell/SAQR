import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { OrderTimeline } from "@/components/saqr/order-timeline";
import { StatusBadge } from "@/components/saqr/status-badge";
import { DELIVERY_STATUS, ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } from "@/features/shared/status";
import type { MainOrderView, SubOrderView } from "@/features/shared/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { Icon } from "@/components/ui/icon";

export function OrdersListView({ orders, base }: { orders: MainOrderView[]; base: string }) {
  if (orders.length === 0) {
    return <EmptyState icon="box" title="لا توجد طلبات بعد">عند تأكيد أول طلب سيظهر هنا مع طلباته الفرعية.</EmptyState>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {orders.map((o) => (
        <li key={o.id}>
          <Card className="flex flex-col gap-3 p-0">
            <Link href={`${base}/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 hover:text-brand">
              <span className="text-lg font-bold">طلب <span className="num">#{formatNumber(o.number)}</span></span>
              <span className="num text-sm text-ink-muted">{formatDateTime(o.createdAt)}</span>
            </Link>
            <ul className="flex flex-col divide-y divide-line border-t border-line">
              {o.subOrders.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="font-semibold">{s.merchantName}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={ORDER_STATUS[s.orderStatus]} />
                    <StatusBadge status={PAYMENT_STATUS[s.paymentStatus]} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between rounded-b-card bg-surface-muted px-5 py-3 text-sm">
              <span className="text-ink-muted">الإجمالي مع التوصيل</span>
              <span className="num font-bold">{formatEgp(o.totalCents)}</span>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SubOrderCard({ s }: { s: SubOrderView }) {
  const needsReceipt = s.paymentStatus === "NOT_REQUIRED_YET" || s.paymentStatus === "REJECTED";
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{s.merchantName} <span className="num text-sm font-normal text-ink-muted">#{formatNumber(s.number)}</span></h3>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={ORDER_STATUS[s.orderStatus]} />
          <StatusBadge status={DELIVERY_STATUS[s.deliveryStatus]} />
          {s.refundStatus !== "NONE" ? <StatusBadge status={REFUND_STATUS[s.refundStatus]} /> : null}
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 text-sm">
        {s.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3">
            <span>{i.name} <span className="num text-ink-muted">× {formatNumber(i.quantity)}</span></span>
            <span className="num font-semibold">{formatEgp(i.lineTotalCents)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 border-t border-line pt-2 font-bold">
          <span>منتجات هذا النشاط</span>
          <span className="num">{formatEgp(s.subtotalCents)}</span>
        </li>
      </ul>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h4 className="font-bold">الدفع</h4>
          <StatusBadge status={PAYMENT_STATUS[s.paymentStatus]} />
          {s.payment ? (
            <p className="text-sm text-ink-muted">
              {s.payment.methodLabel} · <span className="num">{formatEgp(s.payment.amountCents)}</span>
              {s.payment.referenceNo ? <> · <span className="ltr-isolate num">{s.payment.referenceNo}</span></> : null}
              <br />
              <span className="num text-xs">أُرسل {formatDateTime(s.payment.submittedAt)}</span>
            </p>
          ) : null}
          {needsReceipt ? (
            <form className="flex flex-col gap-3" aria-label={`رفع إيصال ${s.merchantName}`}>
              <FileUpload label="صورة إيصال هذا النشاط" name="receipt" disabled />
              <Notice tone="info">رفع الإيصال غير مفعّل بعد على الخادم.</Notice>
              <Button type="button" disabled>إرسال الإيصال</Button>
            </form>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-bold">مسار الطلب</h4>
          <OrderTimeline steps={s.events} label={`مسار طلب ${s.merchantName}`} />
        </div>
      </div>
    </Card>
  );
}

export function OrderDetailView({ order, base }: { order: MainOrderView; base: string }) {
  const productsTotal = order.subOrders.reduce((n, s) => n + s.subtotalCents, 0);
  return (
    <div className="flex flex-col gap-5">
      <Link href={`${base}/orders`} className="flex w-fit items-center gap-1 text-sm font-semibold text-brand">
        <Icon name="chevronRight" className="size-4" />
        كل الطلبات
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">طلب <span className="num">#{formatNumber(order.number)}</span></h1>
        <span className="num text-sm text-ink-muted">{formatDateTime(order.createdAt)}</span>
      </div>
      <p className="text-sm text-ink-muted">التوصيل إلى: {order.addressLine}</p>

      {order.subOrders.map((s) => <SubOrderCard key={s.id} s={s} />)}

      <Card className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-bold">الحساب</h2>
        <div className="flex justify-between"><span className="text-ink-muted">إجمالي المنتجات (لكل نشاط تحويل مستقل)</span><span className="num font-semibold">{formatEgp(productsTotal)}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">رسوم التوصيل</span><span className="num font-semibold">{formatEgp(order.deliveryFeeCents)}</span></div>
        <div className="flex justify-between border-t border-line pt-2 text-base"><span className="font-bold">الإجمالي</span><span className="num font-bold">{formatEgp(order.totalCents)}</span></div>
        <Badge className="w-fit">المبالغ كما سجّلها الخادم</Badge>
      </Card>
    </div>
  );
}
