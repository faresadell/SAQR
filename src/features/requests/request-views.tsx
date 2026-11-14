import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import type { getOrderRequest, listOrderRequests } from "@/server/orders/requests";
import { QuoteForm, RequestButtons } from "./requests-ui";

const STATUS = {
  PENDING_QUOTE: { label: "بانتظار السعر", tone: "warning" },
  QUOTED: { label: "تم تحديد السعر", tone: "info" },
  ACCEPTED: { label: "تمت الموافقة", tone: "success" },
  DECLINED: { label: "اعتذر النشاط", tone: "neutral" },
  CANCELLED: { label: "ملغي", tone: "neutral" },
} as const;

export function RequestList({ rows, base }: { rows: Awaited<ReturnType<typeof listOrderRequests>>; base: string }) {
  if (rows.length === 0) return <EmptyState icon="box" title="لا توجد طلبات مخصصة بعد">ستظهر هنا الطلبات المكتوبة والأسعار النهائية.</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`${base}/${r.id}`} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 hover:border-line-strong">
            <span className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">{r.who}</span>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
            </span>
            <span className="line-clamp-2 text-sm text-ink-muted">{r.body}</span>
            {r.quotedSubtotalCents !== null ? <span className="num text-sm font-semibold">{formatEgp(r.quotedSubtotalCents)}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RequestDetail({ request }: { request: Awaited<ReturnType<typeof getOrderRequest>> }) {
  const customer = request.side === "customer";
  const info = STATUS[request.status];
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{request.who}</h2>
          <Badge tone={info.tone}>{info.label}</Badge>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{request.body}</p>
        <p className="text-xs text-ink-muted">أُرسل: <span className="num">{formatDateTime(request.createdAt)}</span></p>
        {request.quotedSubtotalCents !== null ? (
          <div className="rounded-control bg-canvas p-3 text-sm">
            السعر النهائي للمنتجات: <strong className="num">{formatEgp(request.quotedSubtotalCents)}</strong> (رسوم التوصيل تُضاف عند إنشاء الطلب)
            {request.quoteNote ? <p className="mt-1 text-ink-muted">{request.quoteNote}</p> : null}
          </div>
        ) : null}
      </Card>
      {!customer && request.status === "PENDING_QUOTE" ? <QuoteForm requestId={request.id} /> : null}
      {request.status === "PENDING_QUOTE" || (customer && request.status === "QUOTED") ? (
        <RequestButtons requestId={request.id} canAccept={customer && request.status === "QUOTED"} closeLabel={customer ? "إلغاء الطلب" : "الاعتذار عن الطلب"} />
      ) : null}
      {customer && request.status === "ACCEPTED" ? <Link href="/account/orders" className="font-bold text-brand underline">متابعة الطلب والدفع من «طلباتي»</Link> : null}
    </div>
  );
}
