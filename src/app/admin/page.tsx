import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { hasPermission } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/format";
import { formatPercent, TIER_LABELS_AR } from "@/lib/commission";
import { pickEffective } from "@/lib/effective";
import { requireRole } from "@/server/auth/guards";
import { listCategoryTree } from "@/server/catalog/categories";
import { listCommissionHistory } from "@/server/commissions/service";
import { listZones } from "@/server/delivery/zones";
import { listMerchantsForAdmin } from "@/server/merchants/service";
import { listPaymentMethods } from "@/server/payments/methods";

export const metadata: Metadata = { title: "ملخص الإدارة" };

/** Summary built ONLY from existing, permission-checked services. Order/payment figures arrive with their services. */
export default async function AdminHomePage() {
  const { user } = await requireRole("ADMIN");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user, p);

  const [merchants, zones, methods, history, tree] = await Promise.all([
    can("merchants.review") ? listMerchantsForAdmin(user) : null,
    can("settings.view") || can("settings.manage") ? listZones(user) : null,
    can("settings.view") || can("settings.manage") ? listPaymentMethods(user) : null,
    can("settings.view") || can("settings.manage") ? listCommissionHistory(user) : null,
    can("catalog.manage") ? listCategoryTree(user) : null,
  ]);

  const now = new Date();
  const pending = merchants?.filter((m) => m.status === "PENDING_REVIEW").length ?? 0;
  const rate = (tier: "REGULAR" | "BUSINESS") => {
    const current = history ? pickEffective(history.filter((r) => r.tier === tier), now) : undefined;
    return current ? `${formatPercent(current.basisPoints)}%` : "غير مضبوطة";
  };

  const links = [
    can("users.view") ? { href: "/admin/users", label: "إدارة المستخدمين", icon: "users" as const } : null,
    can("merchants.review") ? { href: "/admin/merchants", label: "مراجعة التجار", icon: "store" as const } : null,
    can("catalog.manage") ? { href: "/admin/catalog", label: "التصنيفات وأنواع النشاط", icon: "grid" as const } : null,
    can("settings.view") || can("settings.manage") ? { href: "/admin/settings", label: "إعدادات المنصة", icon: "settings" as const } : null,
  ].filter((l) => l !== null);

  return (
    <>
      <PageHeader title={`أهلاً ${user.name}`} description="نظرة سريعة على حالة المنصة." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {merchants ? <StatCard label="تجار بانتظار المراجعة" icon="store" tone={pending > 0 ? "warning" : "success"} value={formatNumber(pending)} note={`من ${formatNumber(merchants.length)} تاجراً`} /> : null}
        {zones ? <StatCard label="مناطق التوصيل الفعّالة" icon="truck" value={formatNumber(zones.filter((z) => z.isActive).length)} /> : null}
        {methods ? <StatCard label="وسائل دفع مفعّلة" icon="wallet" tone={methods.some((m) => m.isEnabled) ? "success" : "danger"} value={formatNumber(methods.filter((m) => m.isEnabled).length)} note={methods.some((m) => m.isEnabled) ? undefined : "لا توجد وسيلة مفعّلة: لن يتمكن العملاء من الدفع"} /> : null}
        {tree ? <StatCard label="التصنيفات الرئيسية" icon="grid" tone="neutral" value={formatNumber(tree.length)} /> : null}
      </div>

      {history ? (
        <section className="flex flex-col gap-3">
          <SectionTitle action={<Link href="/admin/settings#commissions" className="text-sm font-semibold text-brand">تعديل</Link>}>العمولات الحالية</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["REGULAR", "BUSINESS"] as const).map((tier) => (
              <Card key={tier} className="flex items-center justify-between">
                <span className="font-semibold text-ink-muted">{TIER_LABELS_AR[tier]}</span>
                <span className="num text-2xl font-bold" dir="ltr">{rate(tier)}</span>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionTitle>اختصارات</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 font-semibold shadow-card hover:border-brand">
              <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-navy-700"><Icon name={l.icon} /></span>
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
