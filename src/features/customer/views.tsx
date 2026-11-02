import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Icon, type IconName } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { Progress } from "@/components/ui/progress";
import { SectionTitle } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StarBalance } from "@/components/saqr/star-balance";
import { SectionGate } from "@/features/shared/section-gate";
import type { Loaded } from "@/features/shared/loaded";
import { PACKAGE_STATE } from "@/features/shared/status";
import type { AddressItem, CurrentPackage, MainOrderView, NotificationItem, RewardsOverview, StarsOverview } from "@/features/shared/types";
import { formatDate, formatNumber } from "@/lib/format";
import { deleteAddressAction } from "./actions";
import { AddressForm, type ZoneOption } from "./address-form";

const ACTIVE_STATES = new Set(["AWAITING_PAYMENT", "AWAITING_MERCHANT_APPROVAL", "APPROVED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "CANCELLATION_REQUESTED"]);

function Shortcut({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface p-4 text-center text-sm font-semibold shadow-card hover:border-brand">
      <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-navy-700">
        <Icon name={icon} />
      </span>
      {label}
    </Link>
  );
}

interface HomeProps {
  base: string;
  name: string;
  stars: Loaded<StarsOverview>;
  pkg: Loaded<CurrentPackage>;
  orders: Loaded<MainOrderView[]>;
  rewards: Loaded<RewardsOverview>;
  notifications: Loaded<NotificationItem[]>;
}

/** Customer dashboard home. Every block loads independently, so one missing service never blanks the page. */
export function CustomerHomeView({ base, name, stars, pkg, orders, rewards, notifications }: HomeProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">أهلاً {name}</h1>
        <p className="text-sm text-ink-muted">ملخص حسابك وطلباتك ونجومك.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SectionGate result={stars}>{(d) => <StarBalance balance={d.balance} className="md:col-span-1" />}</SectionGate>
        <SectionGate result={pkg}>
          {(d) => (
            <StatCard
              label="الباقة الحالية"
              icon="layers"
              value={d.packageName ?? PACKAGE_STATE[d.state].label}
              note={d.expiresAt ? `تنتهي ${formatDate(d.expiresAt)}` : PACKAGE_STATE[d.state].label}
            />
          )}
        </SectionGate>
        <SectionGate result={orders}>
          {(d) => <StatCard label="الطلبات الجارية" icon="box" tone="warning" value={formatNumber(d.filter((o) => o.subOrders.some((s) => ACTIVE_STATES.has(s.orderStatus))).length)} />}
        </SectionGate>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>اختصارات</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Shortcut href="/explore" icon="search" label="ابحث عن نشاط" />
          <Shortcut href="/offers" icon="tag" label="العروض" />
          <Shortcut href={`${base}/packages`} icon="layers" label="شحن النجوم" />
          <Shortcut href={`${base}/tasbeeh`} icon="sun" label="التسبيح" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <SectionTitle action={<Link href={`${base}/rewards`} className="text-sm font-semibold text-brand">التفاصيل</Link>}>المكافآت الشهرية</SectionTitle>
          <SectionGate result={rewards}>{(d) => <RewardsSummary data={d} />}</SectionGate>
        </section>
        <section className="flex flex-col gap-3">
          <SectionTitle action={<Link href={`${base}/notifications`} className="text-sm font-semibold text-brand">الكل</Link>}>آخر الإشعارات</SectionTitle>
          <SectionGate result={notifications}>
            {(d) =>
              d.length === 0 ? (
                <EmptyState icon="bell" title="لا توجد إشعارات" />
              ) : (
                <ul className="flex flex-col gap-2">
                  {d.slice(0, 3).map((n) => (
                    <li key={n.id} className="rounded-card border border-line bg-surface p-3 text-sm">
                      <p className="font-semibold">{n.title}</p>
                      <p className="text-ink-muted">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionGate>
        </section>
      </div>
    </div>
  );
}

function RewardsSummary({ data }: { data: RewardsOverview }) {
  const top = data.tiers[data.tiers.length - 1]?.threshold ?? 1;
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">أكملت <strong className="num text-ink">{formatNumber(data.completedOrders)}</strong> طلباً هذا الشهر</p>
      <Progress value={data.completedOrders} max={top} label="تقدم المكافآت الشهرية" />
    </Card>
  );
}

export function RewardsView({ data }: { data: RewardsOverview }) {
  const top = data.tiers[data.tiers.length - 1]?.threshold ?? 1;
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{data.monthLabel}</h2>
          <span className="text-sm text-ink-muted">الطلبات المكتملة: <strong className="num text-ink">{formatNumber(data.completedOrders)}</strong></span>
        </div>
        <Progress value={data.completedOrders} max={top} label="تقدم المكافآت الشهرية" />
      </Card>
      <ul className="grid gap-3 sm:grid-cols-3">
        {data.tiers.map((t) => {
          const reached = data.completedOrders >= t.threshold;
          return (
            <li key={t.threshold}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-lg font-bold">{formatNumber(t.threshold)} طلبات</span>
                  {t.granted ? <Badge tone="success">مُنحت</Badge> : reached ? <Badge tone="warning">قيد المنح</Badge> : <Badge>لم تتحقق</Badge>}
                </div>
                <p className="text-sm text-ink-muted"><strong className="num text-ink">{formatNumber(t.rewardStars)}</strong> نجمة إضافية</p>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-muted">تُمنح المكافآت من النظام فقط بعد اكتمال الطلبات. المعروض هنا هو ما سجّله النظام، ولا تُمنح أي نجوم من الواجهة.</p>
    </div>
  );
}

export function AddressesView({ items, zones = [] }: { items: AddressItem[]; zones?: ZoneOption[] }) {
  return (
    <div className="flex flex-col gap-5">
      {items.length === 0 ? (
        <EmptyState icon="pin" title="لا توجد عناوين محفوظة">أضف عنواناً ومنطقته ليُحسب رسم التوصيل عند الطلب.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-col gap-1">
                <p className="flex items-center gap-2 font-bold"><Icon name="pin" className="size-4 text-ink-muted" />{a.label}</p>
                <p className="text-sm text-ink-muted">{a.line}</p>
                {a.zoneName ? <Badge className="w-fit">{a.zoneName}</Badge> : null}
                <form action={deleteAddressAction} className="mt-1">
                  <input type="hidden" name="addressId" value={a.id} />
                  <button type="submit" className="text-sm font-semibold text-danger-ink underline">حذف</button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <AddressForm zones={zones} />
    </div>
  );
}

export function ProfileView({ name, phone, roleLabel }: { name: string; phone: string; roleLabel: string }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{name}</h2>
          <Badge tone="info">{roleLabel}</Badge>
        </div>
        <p className="ltr-isolate text-start text-ink-muted">{phone}</p>
        <p className="text-xs text-ink-muted">تعديل البيانات الشخصية غير متاح حالياً.</p>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">الدعم</h2>
        <p className="text-sm text-ink-muted">قناة الدعم لم تُفعَّل بعد. حين تُضاف بيانات التواصل ستظهر هنا.</p>
        <LinkButton href="/privacy" variant="outline" size="sm" className="w-fit">سياسة الخصوصية</LinkButton>
      </Card>
    </div>
  );
}
