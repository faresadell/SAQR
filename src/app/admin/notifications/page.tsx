import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { loadNotificationActivity } from "@/features/admin/data";
import { ResultState } from "@/features/shared/result-state";
import { formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الإشعارات" };

const LABEL: Record<string, string> = {
  PLAN_APPROVED: "تفعيل باقة", PLAN_REJECTED: "رفض طلب باقة", DELIVERY_ASSIGNED: "إسناد توصيل", DELIVERY_FAILED: "تعذر التوصيل",
  ORDER_CANCELLED: "إلغاء طلب", REFUND_COMPLETED: "توثيق رد مبلغ", REFUND_PROOF_REJECTED: "رفض إثبات رد", REFUND_OVERDUE: "رد متأخر (للإدارة)",
  CHAT_MESSAGE: "رسالة محادثة جديدة", COMPLAINT_FILED: "شكوى جديدة (للتاجر)", COMPLAINT_UPDATED: "تحديث شكوى (للعميل)", OFFER_STOPPED: "إيقاف عرض", OFFER_CREATED_BY_ADMIN: "عرض أنشأته الإدارة", CONTEST_WINNER: "فوز بالمسابقة", CONTEST_PAID: "صرف جائزة",
};

export default async function Page() {
  const { user } = await requirePermission("settings.view");
  const result = await loadNotificationActivity(user);
  return (
    <>
      <PageHeader title="الإشعارات" description="الإشعارات التي أرسلها النظام تلقائياً آخر 30 يوماً." />
      <Notice>تُرسَل إشعارات النظام تلقائياً عند أحداث الطلب والدفع والباقات والاسترداد والشكاوى. الإرسال الجماعي اليدوي للمستخدمين غير متاح حالياً (يحتاج قراراً منك، انظر التقرير).</Notice>
      {result.status !== "ready" ? <ResultState result={result} /> : result.data.length === 0 ? <p className="text-sm text-ink-muted">لا توجد إشعارات في هذه الفترة.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.map((r) => (
            <li key={r.type}>
              <Card className="flex items-center justify-between gap-2">
                <span className="font-semibold">{LABEL[r.type] ?? r.type}</span>
                <span className="num text-lg font-bold">{formatNumber(r.count)}</span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
