import type { Metadata } from "next";
import { logoutAction } from "@/app/(auth)/actions";
import { SiteShell } from "@/components/layout/site-shell";
import { LinkButton } from "@/components/ui/link-button";
import { SoundSetting } from "@/features/intro/sound-setting";
import { SettingsAction, SettingsGroup, SettingsLink } from "@/features/settings/settings-parts";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "الإعدادات" };

const ROLE = {
  CUSTOMER: { home: "/account", orders: "/account/orders", label: "عميل", homeLabel: "حسابي" },
  MERCHANT: { home: "/merchant", orders: "/merchant/orders", label: "تاجر", homeLabel: "لوحة التاجر" },
  DRIVER: { home: "/driver", orders: "/driver/tasks", label: "سائق", homeLabel: "لوحة السائق" },
  ADMIN: { home: "/admin", orders: "/admin/orders", label: "إدارة", homeLabel: "لوحة الإدارة" },
} as const;

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const role = session ? ROLE[session.user.role] : null;
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold">الإعدادات</h1>

        {session && role ? (
          <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
            <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xl font-bold text-white">
              {Array.from(session.user.name)[0] ?? "؟"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{session.user.name}</p>
              <p className="text-sm text-ink-muted">{role.label}</p>
            </div>
          </div>
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
            <SettingsLink href={role.home} icon="user" label={role.homeLabel} />
            <SettingsLink href={role.orders} icon="box" label="الطلبات" />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="التفضيلات">
          <li><SoundSetting /></li>
        </SettingsGroup>

        <SettingsGroup title="المساعدة والمعلومات">
          <SettingsLink href="/legal/support" icon="help" label="الدعم" />
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

        <p className="text-center text-xs text-ink-muted">صقر | SAQR</p>
      </div>
    </SiteShell>
  );
}
