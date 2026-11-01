import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCairo } from "@/lib/cairo-time";
import { formatPercent, TIER_LABELS_AR, type TierName } from "@/lib/commission";
import { pickEffective } from "@/lib/effective";
import { formatEgp } from "@/lib/money";
import { hasPermission } from "@/lib/auth/permissions";
import { requireRole } from "@/server/auth/guards";
import { listCommissionHistory } from "@/server/commissions/service";
import { listZones } from "@/server/delivery/zones";
import { listPaymentMethods } from "@/server/payments/methods";
import { listSettingStates, type SettingState } from "@/server/settings/service";
import { CommissionForm } from "./commission-form";
import { SettingsForm, type SettingFieldView } from "./settings-form";
import { CreateZoneForm, ZoneFeeForm } from "./zone-forms";
import { setPaymentReceiverAction, setZoneActiveAction, togglePaymentMethodAction } from "./actions";

export const metadata: Metadata = { title: "إعدادات المنصة" };

const notices: Record<string, string> = {
  done: "تم تنفيذ العملية وتسجيلها في سجل المراجعة.",
  invalid: "البيانات غير صالحة.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  missing: "العنصر غير موجود.",
};

function toFields(states: SettingState[]): SettingFieldView[] {
  return states.map((s) => ({
    key: s.key,
    label: s.label,
    ...(s.help ? { help: s.help } : {}),
    unit: s.unit,
    min: s.min,
    max: s.max,
    current: s.current,
    scheduledText: s.scheduled.map((x) => `مجدول: ${x.value === null ? "بدون قيمة" : x.value} ابتداءً من ${formatCairo(x.effectiveFrom)}`),
  }));
}

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { user } = await requireRole("ADMIN");
  if (!hasPermission(user, "settings.view") && !hasPermission(user, "settings.manage")) notFound();
  const canEdit = hasPermission(user, "settings.manage");
  const { notice } = await searchParams;
  const now = new Date();

  const [orders, security, offers, contest, history, methods, zones] = await Promise.all([
    listSettingStates(user, "orders"),
    listSettingStates(user, "security"),
    listSettingStates(user, "offers"),
    listSettingStates(user, "contest"),
    listCommissionHistory(user),
    listPaymentMethods(user),
    listZones(user),
  ]);

  const tiers: TierName[] = ["REGULAR", "BUSINESS"];
  const merchantResponseUnset = orders.some((s) => s.key === "orders.merchant_response_minutes" && s.current === null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">إعدادات المنصة</h1>
      {notice && notices[notice] ? <p role="status" className="rounded-control bg-brand-soft p-3 text-sm font-medium">{notices[notice]}</p> : null}

      {/* ───────── Commissions ───────── */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">عمولة المنصة حسب عضوية التاجر</h2>
        <p className="text-sm text-ink-muted">
          تُحسب على قيمة المنتجات فقط (بدون رسوم التوصيل) وتُنسخ داخل كل طلب عند إنشائه، فلا يغيّر أي تعديل لاحق الطلبات القديمة.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {tiers.map((tier) => {
            const rows = history.filter((r) => r.tier === tier);
            const current = pickEffective(rows, now);
            return (
              <div key={tier} className="rounded-control border border-line p-4">
                <p className="text-sm text-ink-muted">{TIER_LABELS_AR[tier]}</p>
                <p className="text-3xl font-bold" dir="ltr">{current ? `${formatPercent(current.basisPoints)}%` : "غير مضبوطة"}</p>
              </div>
            );
          })}
        </div>

        {canEdit ? <CommissionForm /> : null}

        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand">سجل النسب</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="text-ink-muted">
                  <th className="p-2 text-start">العضوية</th>
                  <th className="p-2 text-start">النسبة</th>
                  <th className="p-2 text-start">تسري من</th>
                  <th className="p-2 text-start">سجّلها</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="p-2">{TIER_LABELS_AR[r.tier]}</td>
                    <td className="p-2" dir="ltr">{formatPercent(r.basisPoints)}%</td>
                    <td className="p-2">{formatCairo(r.effectiveFrom)} {r.effectiveFrom > now ? <Badge tone="warning">مجدولة</Badge> : null}</td>
                    <td className="p-2">{r.createdByName ?? "النظام"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      {/* ───────── Orders / stars / refunds ───────── */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">الطلبات والنجوم والاسترجاع</h2>
        {merchantResponseUnset ? (
          <p role="status" className="rounded-control bg-warning-soft p-3 text-sm font-medium text-warning-ink">
            مهلة رد التاجر غير محددة بعد. يجب تحديدها قبل تشغيل الطلبات.
          </p>
        ) : null}
        <SettingsForm group="orders" fields={toFields(orders)} canEdit={canEdit} />
      </Card>

      {/* ───────── Offers ───────── */}
      <Card className="flex flex-col gap-4" id="offers">
        <h2 className="text-lg font-bold">العروض والخصومات</h2>
        <p className="text-sm text-ink-muted">
          الخصومات مغلقة افتراضياً (0). عند التفعيل تُطبَّق الحدود على العروض الجديدة فقط، ولا يتغير أي طلب سابق لأن خصم كل طلب يُنسخ داخله عند إنشائه.
        </p>
        <SettingsForm group="offers" fields={toFields(offers)} canEdit={canEdit} />
      </Card>

      {/* ───────── Contest ───────── */}
      <Card className="flex flex-col gap-4" id="contest">
        <h2 className="text-lg font-bold">المسابقة الشهرية</h2>
        <p className="text-sm text-ink-muted">
          تبقى المسابقة مغلقة (0) حتى تراجع صفحة القواعد وتعتمدها من إدارة المحتوى، ثم تفعّلها هنا.
        </p>
        <SettingsForm group="contest" fields={toFields(contest)} canEdit={canEdit} />
      </Card>

      {/* ───────── Payment methods ───────── */}
      <Card className="flex flex-col gap-4" id="payments">
        <h2 className="text-lg font-bold">طرق الدفع</h2>
        <p className="text-sm text-ink-muted">
          تحدد ما يظهر للعميل. صورة الإيصال لا تُعتبر تأكيداً للدفع: التاجر هو من يؤكد وصول التحويل فعلياً.
        </p>
        {methods.every((m) => !m.isEnabled) ? (
          <p role="status" className="rounded-control bg-warning-soft p-3 text-sm font-medium text-warning-ink">
            لا توجد طريقة دفع مفعّلة: لن يتمكن العملاء من إتمام الدفع.
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {methods.map((m) => (
            <div key={m.code} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-4">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{m.nameAr}</span>
                <Badge tone={m.isEnabled ? "success" : "neutral"}>{m.isEnabled ? "مفعّلة" : "معطّلة"}</Badge>
                {m.isEnabled && !m.receiverNumber ? <Badge tone="warning">بدون رقم استلام: لن تُقبل طلبات الدفع</Badge> : null}
              </div>
              {canEdit ? (
                <form action={setPaymentReceiverAction} className="flex items-center gap-2">
                  <input type="hidden" name="code" value={m.code} />
                  <input name="receiver" defaultValue={m.receiverNumber ?? ""} inputMode="tel" dir="ltr" placeholder="رقم الاستلام" aria-label={`رقم استلام ${m.nameAr}`} className="w-44 rounded-control border border-line px-3 py-2 text-sm" />
                  <Button type="submit" size="sm" variant="secondary">حفظ الرقم</Button>
                </form>
              ) : m.receiverNumber ? <span dir="ltr" className="text-sm">{m.receiverNumber}</span> : null}
              {canEdit ? (
                <form action={togglePaymentMethodAction}>
                  <input type="hidden" name="code" value={m.code} />
                  <input type="hidden" name="enabled" value={m.isEnabled ? "false" : "true"} />
                  <Button type="submit" size="sm" variant={m.isEnabled ? "danger" : "primary"}>{m.isEnabled ? "تعطيل" : "تفعيل"}</Button>
                </form>
              ) : null}
            </div>
          ))}
          {methods.length === 0 ? <p className="text-ink-muted">لا توجد طرق دفع. شغّل أمر التهيئة (db:seed).</p> : null}
        </div>
      </Card>

      {/* ───────── Delivery ───────── */}
      <Card className="flex flex-col gap-4" id="delivery">
        <h2 className="text-lg font-bold">مناطق ورسوم التوصيل</h2>
        <p className="text-sm text-ink-muted">يدفع العميل الرسوم نقداً للسائق. تُنسخ الرسوم داخل الطلب عند إنشائه فلا تتأثر به التعديلات اللاحقة.</p>
        <div className="flex flex-col gap-3">
          {zones.map((z) => (
            <div key={z.id} className="flex flex-col gap-3 rounded-control border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{z.name}</span>
                  <Badge tone={z.isActive ? "success" : "neutral"}>{z.isActive ? "نشطة" : "غير نشطة"}</Badge>
                </div>
                <span className="font-bold">{z.currentFeeCents === null ? "بدون رسوم" : formatEgp(z.currentFeeCents)}</span>
              </div>
              {z.upcoming ? (
                <p className="text-sm text-warning-ink">مجدول: {formatEgp(z.upcoming.feeCents)} ابتداءً من {formatCairo(z.upcoming.effectiveFrom)}</p>
              ) : null}
              {canEdit ? (
                <>
                  <ZoneFeeForm zoneId={z.id} />
                  <form action={setZoneActiveAction}>
                    <input type="hidden" name="zoneId" value={z.id} />
                    <input type="hidden" name="active" value={z.isActive ? "false" : "true"} />
                    <Button type="submit" size="sm" variant="ghost">{z.isActive ? "إيقاف المنطقة (لا تُحذف)" : "إعادة تفعيل المنطقة"}</Button>
                  </form>
                </>
              ) : null}
            </div>
          ))}
          {zones.length === 0 ? <p className="text-ink-muted">لا توجد مناطق بعد.</p> : null}
        </div>
        {canEdit ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand">إضافة منطقة جديدة</summary>
            <div className="mt-3"><CreateZoneForm /></div>
          </details>
        ) : null}
      </Card>

      {/* ───────── Security ───────── */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">الأمان وتسجيل الدخول</h2>
        <SettingsForm group="security" fields={toFields(security)} canEdit={canEdit} />
      </Card>
    </div>
  );
}
