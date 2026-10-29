import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCairo } from "@/lib/cairo-time";
import { TIER_LABELS_AR } from "@/lib/commission";
import { requirePermission } from "@/server/auth/guards";
import { listMerchantsForAdmin } from "@/server/merchants/service";
import { reviewMerchantAction, setTierAction } from "./actions";

export const metadata: Metadata = { title: "التجار" };

const statuses = ["PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"] as const;
const statusLabels = { PENDING_REVIEW: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض", SUSPENDED: "موقوف" } as const;
const statusTones = { PENDING_REVIEW: "warning", APPROVED: "success", REJECTED: "danger", SUSPENDED: "danger" } as const;
const notices: Record<string, string> = {
  done: "تم تنفيذ العملية وتسجيلها في سجل المراجعة.",
  invalid: "البيانات غير صالحة.",
  reason: "اكتب سبباً واضحاً (3 أحرف على الأقل).",
  transition: "هذا الإجراء غير متاح في الحالة الحالية.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  missing: "التاجر غير موجود.",
};

const inputClass = "h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm";

export default async function AdminMerchantsPage({ searchParams }: { searchParams: Promise<{ status?: string; notice?: string }> }) {
  const { user } = await requirePermission("merchants.review");
  const { status, notice } = await searchParams;
  const filter = statuses.find((s) => s === status);
  const merchants = await listMerchantsForAdmin(user, filter);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">التجار</h1>
      {notice && notices[notice] ? <p role="status" className="rounded-control bg-brand-soft p-3 text-sm font-medium">{notices[notice]}</p> : null}

      <nav className="flex flex-wrap gap-2" aria-label="تصفية الحالة">
        <Link href="/admin/merchants" className={`rounded-full px-3 py-1 text-sm ${filter ? "bg-line" : "bg-navy-900 text-white"}`}>الكل</Link>
        {statuses.map((s) => (
          <Link key={s} href={`/admin/merchants?status=${s}`} className={`rounded-full px-3 py-1 text-sm ${filter === s ? "bg-navy-900 text-white" : "bg-line"}`}>{statusLabels[s]}</Link>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        {merchants.map((m) => (
          <Card key={m.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{m.name}</p>
                <p className="text-sm text-ink-muted">{m.businessTypeRef.nameAr} · {m.owner.name} · <span className="ltr-isolate">{m.owner.phone}</span></p>
                <p className="text-xs text-ink-muted">سُجّل {formatCairo(m.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Badge tone="info">{TIER_LABELS_AR[m.tier]}</Badge>
                <Badge tone={statusTones[m.status]}>{statusLabels[m.status]}</Badge>
              </div>
            </div>
            {m.description ? <p className="text-sm">{m.description}</p> : null}
            {m.rejectionReason ? <p className="text-sm text-danger-ink">سبب الرفض: {m.rejectionReason}</p> : null}

            <div className="flex flex-col gap-2">
              {m.status === "PENDING_REVIEW" ? (
                <>
                  <form action={reviewMerchantAction}>
                    <input type="hidden" name="merchantId" value={m.id} />
                    <input type="hidden" name="action" value="APPROVE" />
                    <Button type="submit" size="sm">اعتماد</Button>
                  </form>
                  <form action={reviewMerchantAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="merchantId" value={m.id} />
                    <input type="hidden" name="action" value="REJECT" />
                    <input name="reason" required minLength={3} maxLength={300} placeholder="سبب الرفض" className={inputClass} />
                    <Button type="submit" size="sm" variant="danger">رفض</Button>
                  </form>
                </>
              ) : null}
              {m.status === "APPROVED" ? (
                <form action={reviewMerchantAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="merchantId" value={m.id} />
                  <input type="hidden" name="action" value="SUSPEND" />
                  <input name="reason" required minLength={3} maxLength={300} placeholder="سبب الإيقاف" className={inputClass} />
                  <Button type="submit" size="sm" variant="danger">إيقاف</Button>
                </form>
              ) : null}
              {m.status === "SUSPENDED" ? (
                <form action={reviewMerchantAction}>
                  <input type="hidden" name="merchantId" value={m.id} />
                  <input type="hidden" name="action" value="REACTIVATE" />
                  <Button type="submit" size="sm">إعادة التفعيل</Button>
                </form>
              ) : null}

              <form action={setTierAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="merchantId" value={m.id} />
                <select name="tier" defaultValue={m.tier} className="h-10 rounded-control border border-line bg-surface px-2 text-sm" aria-label="عضوية التاجر">
                  <option value="REGULAR">{TIER_LABELS_AR.REGULAR}</option>
                  <option value="BUSINESS">{TIER_LABELS_AR.BUSINESS}</option>
                </select>
                <input name="reason" required minLength={3} maxLength={300} placeholder="سبب تغيير العضوية" className={inputClass} />
                <Button type="submit" size="sm" variant="secondary">تغيير العضوية</Button>
              </form>
              <p className="text-xs text-ink-muted">تغيير العضوية يسري على الطلبات الجديدة فقط، ولا يغيّر عمولة أي طلب سابق.</p>
            </div>
          </Card>
        ))}
        {merchants.length === 0 ? <p className="text-ink-muted">لا توجد نتائج.</p> : null}
      </div>
    </div>
  );
}
