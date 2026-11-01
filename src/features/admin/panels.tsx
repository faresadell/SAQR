"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/states";
import type { FormState } from "@/lib/form-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";
import { adminStopOfferAction, contestAction, handleComplaintAction, reviewPurchaseAction, reviewRefundAction, updatePlanAction } from "./actions";
import type { ComplaintsAdminData, ContestAdminData, OfferAdminRow, PackageAdminRow, PurchaseReviewRow } from "./types";

const idle: FormState = {};
const ROLE_LABEL: Record<string, string> = { CUSTOMER: "عميل", MERCHANT: "تاجر", DRIVER: "سائق" };
const input = "rounded-control border border-line bg-surface px-3 py-2 text-sm";

function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </>
  );
}

// ───────────── payments: plan purchases ─────────────

function PurchaseCard({ row }: { row: PurchaseReviewRow }) {
  const [state, action, pending] = useActionState(reviewPurchaseAction, idle);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{row.buyerName} <span className="text-xs font-normal text-ink-muted">({ROLE_LABEL[row.buyerRole] ?? row.buyerRole})</span></h3>
        {row.flagged ? <Badge tone="danger">رقم عملية متكرر</Badge> : null}
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-muted">الباقة</dt><dd className="font-semibold">{row.planName}</dd></div>
        <div><dt className="text-ink-muted">المبلغ</dt><dd className="num font-bold">{formatEgp(row.priceCents)}</dd></div>
        <div><dt className="text-ink-muted">النجوم عند الاعتماد</dt><dd className="num font-semibold">{formatNumber(row.stars)}</dd></div>
        <div><dt className="text-ink-muted">وسيلة التحويل</dt><dd>{row.method}</dd></div>
        <div><dt className="text-ink-muted">رقم العملية</dt><dd className="ltr-isolate num font-semibold">{row.referenceNo}</dd></div>
        <div><dt className="text-ink-muted">وقت الطلب</dt><dd className="num">{formatDateTime(row.createdAt)}</dd></div>
      </dl>
      {row.flagReason ? <Notice tone="warning">{row.flagReason}. راجع الإيصال جيداً قبل الاعتماد.</Notice> : null}
      {row.receiptUploadId ? <a className="w-fit text-sm font-semibold text-brand underline" href={`/api/v1/receipts/${row.receiptUploadId}`} target="_blank" rel="noopener noreferrer">عرض صورة الإيصال</a> : null}
      <form action={action} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
        <input type="hidden" name="id" value={row.id} />
        <input name="reason" maxLength={300} placeholder="سبب الرفض (مطلوب عند الرفض)" aria-label="سبب الرفض" className={`${input} min-w-56 flex-1`} />
        <Button type="submit" name="decision" value="APPROVE" loading={pending}>اعتماد الدفع</Button>
        <Button type="submit" variant="danger" name="decision" value="REJECT" loading={pending}>رفض</Button>
      </form>
      <Feedback state={state} />
    </Card>
  );
}

export function PurchaseReviewPanel({ rows }: { rows: PurchaseReviewRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice>صورة الإيصال وحدها ليست دليلاً. تأكد من وصول التحويل على الرقم المعتمد قبل الاعتماد. لا تُمنح النجوم ولا تُفعَّل الباقة إلا بعد اعتمادك.</Notice>
      {rows.length === 0 ? <EmptyState icon="receipt" title="لا توجد طلبات شراء قيد المراجعة" /> : rows.map((r) => <PurchaseCard key={r.id} row={r} />)}
    </div>
  );
}

// ───────────── packages ─────────────

function PlanForm({ plan }: { plan: PackageAdminRow }) {
  const [state, action, pending] = useActionState(updatePlanAction, idle);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{plan.name} <span className="text-xs font-normal text-ink-muted">({ROLE_LABEL[plan.audience]})</span></h3>
        <Badge tone={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "معروضة" : "غير معروضة"}</Badge>
      </div>
      <form action={action} className="grid gap-3 sm:grid-cols-5">
        <input type="hidden" name="code" value={plan.code} />
        <Field label="السعر (جنيه)" name="priceEgp" type="number" min={0.01} step="0.01" defaultValue={plan.priceCents / 100} required />
        <Field label="نجوم أساسية" name="baseStars" type="number" min={0} defaultValue={plan.baseStars} required />
        <Field label="نجوم إضافية" name="bonusStars" type="number" min={0} defaultValue={plan.bonusStars} required />
        <Field label="حصة العروض" name="offerQuota" type="number" min={0} defaultValue={plan.offerQuota ?? ""} hint="اتركه فارغاً لبدون حصة" />
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold"><input type="checkbox" name="isActive" defaultChecked={plan.isActive} /> معروضة للبيع</label>
        <div className="sm:col-span-5 flex items-center gap-3">
          <Button type="submit" loading={pending}>حفظ</Button>
          <Feedback state={state} />
        </div>
      </form>
    </Card>
  );
}

export function PackagesAdminPanel({ rows, canEdit }: { rows: PackageAdminRow[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice>التعديل يسري على الشراء الجديد فقط. من اشترى قبل ذلك يحتفظ بسعره ونجومه كما سُجّلت وقت طلبه.</Notice>
      {rows.map((p) => (canEdit ? <PlanForm key={p.code} plan={p} /> : (
        <Card key={p.code} className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold">{p.name} ({ROLE_LABEL[p.audience]})</span>
          <span className="num text-sm">{formatEgp(p.priceCents)} · {formatNumber(p.baseStars)} + {formatNumber(p.bonusStars)} نجمة</span>
        </Card>
      )))}
    </div>
  );
}

// ───────────── refunds + complaints ─────────────

const REFUND_LABEL = { PENDING: "بانتظار التاجر", UNDER_REVIEW: "بانتظار توثيقك", COMPLETED: "موثّق" } as const;
const COMPLAINT_LABEL = { OPEN: "جديدة", IN_REVIEW: "قيد المراجعة", RESOLVED: "تم الحل", DISMISSED: "مرفوضة" } as const;

function RefundCard({ r }: { r: ComplaintsAdminData["refunds"][number] }) {
  const [state, action, pending] = useActionState(reviewRefundAction, idle);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">رد مبلغ الطلب <span className="num">#{formatNumber(r.orderNumber)}</span> — <span className="num">{formatEgp(r.amountCents)}</span></h3>
        <span className="flex gap-1.5">{r.isOverdue ? <Badge tone="danger">متأخر</Badge> : null}<Badge tone={r.status === "UNDER_REVIEW" ? "warning" : "info"}>{REFUND_LABEL[r.status]}</Badge></span>
      </div>
      <p className="text-xs text-ink-muted">الموعد النهائي: <span className="num">{formatDateTime(r.dueAt)}</span>{r.decisionNote ? ` · ملاحظة سابقة: ${r.decisionNote}` : ""}</p>
      {r.proofUploadId ? <a className="w-fit text-sm font-semibold text-brand underline" href={`/api/v1/receipts/${r.proofUploadId}`} target="_blank" rel="noopener noreferrer">عرض إثبات الرد</a> : null}
      {r.status === "UNDER_REVIEW" ? (
        <form action={action} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
          <input type="hidden" name="id" value={r.id} />
          <input name="reason" maxLength={300} placeholder="سبب رفض الإثبات (مطلوب عند الرفض)" aria-label="السبب" className={`${input} min-w-56 flex-1`} />
          <Button type="submit" name="decision" value="VERIFY" loading={pending}>توثيق الرد</Button>
          <Button type="submit" variant="danger" name="decision" value="REJECT_PROOF" loading={pending}>رفض الإثبات</Button>
        </form>
      ) : <p className="text-xs text-ink-muted">بانتظار أن يرفع التاجر إثبات الرد.</p>}
      <Feedback state={state} />
    </Card>
  );
}

function ComplaintCard({ c }: { c: NonNullable<ComplaintsAdminData["complaints"]>[number] }) {
  const [state, action, pending] = useActionState(handleComplaintAction, idle);
  const open = c.status === "OPEN" || c.status === "IN_REVIEW";
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{c.subject}{c.orderNumber !== null ? <span className="text-xs font-normal text-ink-muted"> — طلب #{formatNumber(c.orderNumber)}</span> : null}</h3>
        <Badge tone={open ? "warning" : "neutral"}>{COMPLAINT_LABEL[c.status]}</Badge>
      </div>
      <p className="text-sm">{c.details}</p>
      <p className="text-xs text-ink-muted num">{formatDateTime(c.createdAt)}</p>
      {c.adminResponse ? <p className="rounded-control bg-canvas p-2 text-sm">الرد: {c.adminResponse}</p> : null}
      {open ? (
        <form action={action} className="flex flex-col gap-2 border-t border-line pt-2">
          <input type="hidden" name="id" value={c.id} />
          <textarea name="response" maxLength={1000} rows={2} placeholder="الرد على العميل (مطلوب عند الحل أو الرفض)" aria-label="الرد" className={input} />
          <div className="flex flex-wrap gap-2">
            {c.status === "OPEN" ? <Button type="submit" variant="outline" name="to" value="IN_REVIEW" loading={pending}>بدء المراجعة</Button> : null}
            <Button type="submit" name="to" value="RESOLVED" loading={pending}>تم الحل</Button>
            <Button type="submit" variant="danger" name="to" value="DISMISSED" loading={pending}>رفض الشكوى</Button>
          </div>
        </form>
      ) : null}
      <Feedback state={state} />
    </Card>
  );
}

export function ComplaintsPanel({ data }: { data: ComplaintsAdminData }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">استرداد المبالغ</h2>
        <Notice>المنصة لا تنقل أموالاً. «توثيق الرد» يسجّل أنك راجعت إثبات تحويل التاجر للعميل.</Notice>
        {data.refunds.length === 0 ? <EmptyState icon="receipt" title="لا توجد استردادات مفتوحة" /> : data.refunds.map((r) => <RefundCard key={r.id} r={r} />)}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">الشكاوى</h2>
        {data.complaints === null ? <Notice tone="warning">ليست لديك صلاحية إدارة الشكاوى.</Notice> : data.complaints.length === 0 ? <EmptyState icon="flag" title="لا توجد شكاوى" /> : data.complaints.map((c) => <ComplaintCard key={c.id} c={c} />)}
      </section>
    </div>
  );
}

// ───────────── offers ─────────────

const OFFER_STATE = { ACTIVE: { label: "جارٍ", tone: "success" }, EXPIRED: { label: "منتهٍ", tone: "neutral" }, STOPPED: { label: "موقوف", tone: "warning" } } as const;

function OfferRow({ o }: { o: OfferAdminRow }) {
  const [state, action, pending] = useActionState(adminStopOfferAction, idle);
  const info = OFFER_STATE[o.state];
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{o.title} <span className="text-xs font-normal text-ink-muted">— {o.merchantName}</span></h3>
        <span className="flex gap-1.5">{o.discountLabel ? <Badge tone="success">{o.discountLabel}</Badge> : null}<Badge tone={info.tone}>{info.label}</Badge></span>
      </div>
      <p className="text-xs text-ink-muted">ينتهي: <span className="num">{formatDateTime(o.endsAt)}</span>{o.stopReason ? ` · سبب الإيقاف: ${o.stopReason}` : ""}</p>
      {o.state === "ACTIVE" ? (
        <form action={action} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
          <input type="hidden" name="id" value={o.id} />
          <input name="reason" required minLength={3} maxLength={300} placeholder="سبب الإيقاف (يصل للتاجر)" aria-label="سبب الإيقاف" className={`${input} min-w-56 flex-1`} />
          <Button type="submit" variant="danger" loading={pending}>إيقاف العرض</Button>
        </form>
      ) : null}
      <Feedback state={state} />
    </Card>
  );
}

export function OffersAdminPanel({ rows }: { rows: OfferAdminRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Notice>حدود الخصم والمدة وتكلفة التمديد تُعدَّل من «الإعدادات العامة». التغيير لا يمس الطلبات السابقة لأن خصم كل طلب مسجّل داخله.</Notice>
      {rows.length === 0 ? <EmptyState icon="tag" title="لا توجد عروض" /> : rows.map((o) => <OfferRow key={o.id} o={o} />)}
    </div>
  );
}

// ───────────── contest ─────────────

const AWARD_LABEL: Record<string, string> = { PROPOSED: "مقترحة", APPROVED: "معتمدة", REJECTED: "مرفوضة", PAID: "مصروفة" };

function ContestControls({ data }: { data: ContestAdminData }) {
  const [state, action, pending] = useActionState(contestAction, idle);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="monthKey" value={data.monthKey} />
        <Button type="submit" name="command" value="propose" loading={pending} disabled={!data.closed || !data.enabled || !data.rulesApproved} className="w-fit">اقتراح الجوائز من الترتيب</Button>
        {!data.closed ? <p className="text-xs text-ink-muted">الشهر لم ينتهِ؛ الترتيب معاينة فقط.</p> : null}
        {!data.enabled ? <p className="text-xs text-ink-muted">المسابقة مغلقة من الإعدادات.</p> : null}
        {!data.rulesApproved ? <p className="text-xs text-ink-muted">صفحة قواعد المسابقة غير معتمدة.</p> : null}
      </form>
      <Feedback state={state} />
      <ul className="flex flex-col gap-2">
        {data.standings.length === 0 ? <li><EmptyState icon="star" title="لا يوجد مشاركون مؤهلون بعد" /></li> : data.standings.map((s) => (
          <li key={s.userId}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold"><span className="num">#{formatNumber(s.rank)}</span> {s.name}</span>
                <span className="text-sm text-ink-muted num">{formatNumber(s.qualifyingOrders)} طلب مؤهل · {formatEgp(s.qualifyingSalesCents)}</span>
              </div>
              <form action={action} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="monthKey" value={data.monthKey} />
                <input type="hidden" name="userId" value={s.userId} />
                <input name="reason" required minLength={3} maxLength={300} placeholder="سبب الاستبعاد (تلاعب/احتيال)" aria-label="سبب الاستبعاد" className={`${input} min-w-56 flex-1`} />
                <Button type="submit" size="sm" variant="danger" name="command" value="exclude" loading={pending}>استبعاد</Button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
      {data.excluded.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">المستبعدون</h3>
          {data.excluded.map((e) => (
            <form key={e.userId} action={action} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3 text-sm">
              <span>{e.userId.slice(0, 8)}… — {e.reason}</span>
              <input type="hidden" name="monthKey" value={data.monthKey} />
              <input type="hidden" name="userId" value={e.userId} />
              <Button type="submit" size="sm" variant="outline" name="command" value="restore" loading={pending}>إعادة</Button>
            </form>
          ))}
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="font-bold">الجوائز</h3>
        {data.awards.length === 0 ? <p className="text-sm text-ink-muted">لا توجد جوائز لهذا الشهر.</p> : data.awards.map((a) => (
          <Card key={a.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold"><span className="num">#{formatNumber(a.rank)}</span> {a.userName} — <span className="num">{formatEgp(a.prizeCents)}</span></span>
              <Badge tone={a.status === "PAID" ? "success" : a.status === "REJECTED" ? "danger" : "warning"}>{AWARD_LABEL[a.status] ?? a.status}</Badge>
            </div>
            <p className="text-xs text-ink-muted">{a.basisNote}{a.paymentReference ? ` · مرجع الصرف: ${a.paymentReference}` : ""}</p>
            {a.status === "PROPOSED" || a.status === "APPROVED" ? (
              <form action={action} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
                <input type="hidden" name="id" value={a.id} />
                {a.status === "PROPOSED" ? (
                  <>
                    <input name="reason" maxLength={300} placeholder="سبب الرفض (عند الرفض)" aria-label="سبب الرفض" className={`${input} min-w-48 flex-1`} />
                    <Button type="submit" name="command" value="approve" loading={pending}>اعتماد</Button>
                    <Button type="submit" variant="danger" name="command" value="reject" loading={pending}>رفض</Button>
                  </>
                ) : (
                  <>
                    <input name="reference" minLength={3} maxLength={64} placeholder="مرجع الصرف" aria-label="مرجع الصرف" className={`${input} min-w-48 flex-1`} />
                    <Button type="submit" name="command" value="paid" loading={pending}>تسجيل الصرف</Button>
                  </>
                )}
              </form>
            ) : null}
          </Card>
        ))}
      </section>
    </div>
  );
}

export function ContestPanel({ data }: { data: ContestAdminData }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone={data.enabled && data.rulesApproved ? "info" : "warning"}>
        الحالة: {data.enabled ? "المسابقة مفعّلة" : "المسابقة مغلقة"} · قواعد المسابقة {data.rulesApproved ? "معتمدة" : "غير معتمدة"}. الترتيب: عدد الطلبات المؤهلة، ثم قيمة المبيعات المؤهلة، ثم الأسبق في الوصول للنتيجة. تُستبعد الطلبات الملغية والمستردة كلياً وطلبات التاجر من محله.
      </Notice>
      <ContestControls data={data} />
    </div>
  );
}
