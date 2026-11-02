import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { Notice } from "@/components/ui/states";
import { SectionTitle } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { loadMerchantOffers, loadMerchantOrders, loadMerchantPackages } from "@/features/merchant/data";
import { SectionGate } from "@/features/shared/section-gate";
import { MERCHANT_STATUS } from "@/features/shared/status";
import { formatNumber } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { listOwnProducts } from "@/server/catalog/products";
import { getOwnMerchant } from "@/server/merchants/service";
import { resubmitMerchantAction } from "./actions";

export const metadata: Metadata = { title: "ملخص النشاط" };

const statusText = {
  PENDING_REVIEW: "نراجع بيانات نشاطك. يمكنك تعديلها حتى يتم الاعتماد.",
  APPROVED: "نشاطك معتمد ويظهر للعملاء.",
  REJECTED: "تم رفض الطلب. عدّل البيانات ثم أعد الإرسال.",
  SUSPENDED: "تم إيقاف نشاطك. تواصل مع الدعم.",
} as const;

const SHORTCUTS: { href: string; label: string; icon: IconName }[] = [
  { href: "/merchant/products/new", label: "إضافة منتج", icon: "plus" },
  { href: "/merchant/products", label: "إدارة المنتجات", icon: "store" },
  { href: "/merchant/profile", label: "بيانات النشاط وساعات العمل", icon: "settings" },
];

export default async function MerchantOverviewPage() {
  const { user } = await requireRole("MERCHANT");
  const shop = await getOwnMerchant(user);
  const products = shop?.status === "APPROVED" ? await listOwnProducts(user) : [];
  const [orders, offers, packages] = await Promise.all([loadMerchantOrders(user), loadMerchantOffers(user), loadMerchantPackages(user)]);

  if (!shop) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">مرحباً {user.name}</h1>
        <Card className="flex flex-col items-start gap-3">
          <h2 className="text-lg font-bold">أكمل بيانات نشاطك</h2>
          <p className="text-sm text-ink-muted">أضف اسم النشاط ونوعه وساعات العمل، وسنراجعها قبل ظهوره للعملاء.</p>
          <LinkButton href="/merchant/profile">ابدأ الآن</LinkButton>
        </Card>
      </div>
    );
  }

  const info = MERCHANT_STATUS[shop.status];
  const available = products.filter((p) => p.isAvailable).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{shop.name}</h1>
          <p className="text-sm text-ink-muted">{statusText[shop.status]}</p>
        </div>
        <Badge tone={info.tone}>{info.label}</Badge>
      </div>

      {shop.status === "REJECTED" ? (
        <Card className="flex flex-col gap-3">
          {shop.rejectionReason ? <Notice tone="danger">السبب: {shop.rejectionReason}</Notice> : null}
          <form action={resubmitMerchantAction}>
            <Button type="submit" size="sm">إعادة إرسال للمراجعة</Button>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="المنتجات" icon="store" value={formatNumber(products.length)} note={shop.status === "APPROVED" ? `${formatNumber(available)} متاح للطلب` : "تُدار بعد اعتماد النشاط"} />
        <SectionGate result={orders}>{(d) => <StatCard label="طلبات تحتاج إجراء" icon="box" tone="warning" value={formatNumber(d.filter((o) => o.actions.approve || o.actions.confirmPayment || o.actions.advanceTo !== null || o.actions.resolveCancellation).length)} />}</SectionGate>
        <SectionGate result={offers}>{(d) => <StatCard label="عروض جارية" icon="tag" tone="success" value={formatNumber(d.offers.filter((o) => o.state === "ACTIVE").length)} />}</SectionGate>
        <SectionGate result={packages}>{(d) => <StatCard label="رصيد النجوم" icon="star" tone="warning" value={formatNumber(d.stars.balance)} />}</SectionGate>
      </div>

      {shop.status === "APPROVED" ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>اختصارات</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {SHORTCUTS.map((s) => (
              <Link key={s.href} href={s.href} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 font-semibold shadow-card hover:border-brand">
                <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-navy-700"><Icon name={s.icon} /></span>
                {s.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
