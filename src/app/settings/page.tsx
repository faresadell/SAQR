import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { SiteShell } from "@/components/layout/site-shell";
import { LinkButton } from "@/components/ui/link-button";
import { SoundSetting } from "@/features/intro/sound-setting";
import type { IconName } from "@/components/ui/icon";
import { SettingsAction, SettingsGroup, SettingsLink } from "@/features/settings/settings-parts";
import { avatarVersion } from "@/server/auth/avatar";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "الإعدادات" };

type Extra = { href: string; icon: IconName; label: string };

const ROLE: Record<string, { home: string; orders: string; label: string; homeLabel: string; extras: Extra[] }> = {
  CUSTOMER: {
    home: "/account",
    orders: "/account/orders",
    label: "عميل",
    homeLabel: "حسابي",
    extras: [
      { href: "/account/addresses", icon: "pin", label: "عناويني" },
      { href: "/account/notifications", icon: "bell", label: "الإشعارات" },
      { href: "/account/stars", icon: "star", label: "نجومي" },
      { href: "/account/rewards", icon: "gift", label: "المكافآت" },
    ],
  },
  MERCHANT: {
    home: "/merchant",
    orders: "/merchant/orders",
    label: "تاجر",
    homeLabel: "لوحة التاجر",
    extras: [
      { href: "/merchant/profile", icon: "store", label: "بيانات المتجر" },
      { href: "/merchant/notifications", icon: "bell", label: "الإشعارات" },
    ],
  },
  DRIVER: {
    home: "/driver",
    orders: "/driver/tasks",
    label: "سائق",
    homeLabel: "لوحة السائق",
    extras: [{ href: "/driver/profile", icon: "truck", label: "بيانات السائق" }],
  },
  ADMIN: { home: "/admin", orders: "/admin/orders", label: "إدارة", homeLabel: "لوحة الإدارة", extras: [] },
};

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const role = session ? ROLE[session.user.role] : null;
  const version = session ? await avatarVersion(session.user.id) : null;
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold">الإعدادات</h1>

        {session && role ? (
          <Link href="/settings/account" className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card transition-all hover:shadow-pop active:scale-[0.99]">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-2xl font-bold text-white">
              {version ? (
                // eslint-disable-next-line @next/next/no-img-element -- the user's own private picture
                <img src={`/api/me/avatar?v=${version}`} alt="" className="size-full object-cover" />
              ) : (
                <span aria-hidden="true">{Array.from(session.user.name)[0] ?? "؟"}</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">{session.user.name}</p>
              <p className="text-sm text-ink-muted">{role.label} · <span className="ltr-isolate">{session.user.phone}</span></p>
              <p className="text-xs font-semibold text-brand">عرض وتعديل حسابي</p>
            </div>
          </Link>
        ) : (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
            <div>
              <p className="text-lg font-bold">مرحباً بك في صقر</p>
              <p className="text-sm text-ink-muted">سجّل دخولك لمتابعة طلباتك، أو أنشئ حساباً كعميل أو تاجر أو سائق.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <LinkButton href="/login" className="w-full sm:flex-1">تسجيل الدخول</LinkButton>
              <LinkButton href="/register" variant="outline" className="w-full sm:flex-1">إنشاء حساب</LinkButton>
            </div>
          </div>
        )}

        {session && role ? (
          <SettingsGroup title="حسابي">
            <SettingsLink href="/settings/account" icon="user" label="بياناتي (الاسم والإيميل والرقم والصورة)" />
            <SettingsLink href={role.home} icon="home" label={role.homeLabel} />
            <SettingsLink href={role.orders} icon="box" label="الطلبات" />
            {role.extras.map((e) => (
              <SettingsLink key={e.href} href={e.href} icon={e.icon} label={e.label} />
            ))}
          </SettingsGroup>
        ) : null}

        {session && role ? (
          <SettingsGroup title="الأمان">
            <SettingsLink href="/settings/account" icon="lock" label="تغيير كلمة المرور" hint="من صفحة بياناتي" />
            <SettingsLink href="/settings/account" icon="phone" label="تغيير رقم الهاتف والإيميل" />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="التفضيلات">
          <li><SoundSetting /></li>
          <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <span className="font-semibold text-ink">اللغة</span>
            <span className="text-sm text-ink-muted">العربية</span>
          </li>
          <SettingsLink href="/tasbeeh" icon="heart" label="التسبيح والأذكار" />
        </SettingsGroup>

        <SettingsGroup title="تصفّح">
          <SettingsLink href="/" icon="home" label="الصفحة الرئيسية" />
          <SettingsLink href="/explore" icon="search" label="استكشف المتاجر" />
          <SettingsLink href="/offers" icon="tag" label="العروض" />
          <SettingsLink href="/cart" icon="cart" label="السلة" />
        </SettingsGroup>

        <SettingsGroup title="المساعدة والمعلومات">
          <SettingsLink href="/legal/support" icon="help" label="الدعم والتواصل معنا" hint="للمساعدة أو لطلب حذف حسابك وبياناتك" />
          <SettingsLink href="/legal/privacy" icon="shield" label="سياسة الخصوصية" />
          <SettingsLink href="/legal/terms" icon="receipt" label="الشروط والأحكام" />
          <SettingsLink href="/legal/cancellation" icon="xCircle" label="سياسة الإلغاء" />
          <SettingsLink href="/legal/refund" icon="undo" label="سياسة الاسترجاع" />
        </SettingsGroup>

        {session ? (
          <SettingsGroup title="الجلسة">
            <SettingsAction action={logoutAction} icon="logout" label="تسجيل الخروج" danger />
          </SettingsGroup>
        ) : null}

        <p className="text-center text-xs text-ink-muted">صقر | SAQR · الإصدار 0.1</p>
      </div>
    </SiteShell>
  );
}
