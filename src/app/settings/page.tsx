import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { SiteShell } from "@/components/layout/site-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { SoundSetting } from "@/features/intro/sound-setting";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "الإعدادات" };

const roleHome = { CUSTOMER: ["/account", "حسابي"], MERCHANT: ["/merchant", "لوحة التاجر"], DRIVER: ["/driver", "لوحة السائق"], ADMIN: ["/admin", "لوحة الإدارة"] } as const;
const LEGAL = [
  ["privacy", "سياسة الخصوصية"],
  ["terms", "الشروط والأحكام"],
  ["cancellation", "سياسة الإلغاء"],
  ["refund", "سياسة الاسترجاع"],
  ["support", "الدعم"],
] as const;

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const home = session ? roleHome[session.user.role] : null;
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 sm:px-6">
        <PageHeader title="الإعدادات" description="الحساب والصوت والصفحات القانونية." />
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">الحساب</h2>
          {session && home ? (
            <>
              <p className="text-sm text-ink-muted">مسجّل الدخول باسم {session.user.name}.</p>
              <div className="flex flex-wrap gap-2">
                <LinkButton href={home[0]}>{home[1]}</LinkButton>
                <form action={logoutAction}><Button type="submit" variant="outline">تسجيل الخروج</Button></form>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">سجّل دخولك لمتابعة طلباتك، أو أنشئ حساباً كعميل أو تاجر أو سائق.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <LinkButton href="/login" className="w-full sm:w-auto">تسجيل الدخول</LinkButton>
                <LinkButton href="/register" variant="outline" className="w-full sm:w-auto">إنشاء حساب</LinkButton>
              </div>
            </>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">الصوت</h2>
          <SoundSetting />
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">صفحات قانونية</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {LEGAL.map(([slug, label]) => (
              <li key={slug}><Link href={`/legal/${slug}`} className="font-semibold text-brand underline">{label}</Link></li>
            ))}
          </ul>
        </Card>
      </div>
    </SiteShell>
  );
}
