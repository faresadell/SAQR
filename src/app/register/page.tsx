import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { getEnv } from "@/lib/env";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "إنشاء حساب" };

type Role = "CUSTOMER" | "MERCHANT" | "DRIVER";

const ROLES: Record<Role, { tab: string; tag: string; title: string; text: string; need: string[]; steps: string[]; note?: string }> = {
  CUSTOMER: {
    tab: "عميل",
    tag: "للعملاء",
    title: "اطلب من أكثر من نشاط في سلة واحدة",
    text: "سجّل بإيميلك ورقم موبايلك، فعّل حسابك بالرمز، وابدأ التسوق.",
    need: ["إيميل شغّال (يصله رمز تفعيل الحساب)", "رقم موبايل مصري", "كلمة مرور قوية"],
    steps: ["فعّل حسابك بالرمز المرسل إلى إيميلك", "تصفّح الأنشطة وأضف ما تريد إلى السلة", "حوّل المبلغ وأرفق الإيصال، وتابع طلبك حتى يصل"],
  },
  MERCHANT: {
    tab: "تاجر",
    tag: "للتجار",
    title: "افتح نشاطك على صقر",
    text: "سجّل حسابك، ثم أضف بيانات نشاطك ومنتجاتك. نراجع النشاط قبل ظهوره للعملاء.",
    need: ["إيميل شغّال (يصله رمز تفعيل الحساب)", "رقم موبايل مصري", "بيانات نشاطك: الاسم والنوع والعنوان (تضيفها بعد التفعيل)", "صور ووصف لمنتجاتك"],
    steps: ["فعّل حسابك بالرمز المرسل إلى إيميلك", "أضف بيانات نشاطك، ويراجعها فريق صقر ويمكنك تعديلها حتى الاعتماد", "أضف منتجاتك، وبعد الاعتماد يظهر نشاطك للعملاء وتستقبل طلباتك"],
    note: "عمولة صقر 8% على قيمة المنتجات بعد الخصم (5% لباقة Premium)، ولا تُحسب على رسوم التوصيل.",
  },
  DRIVER: {
    tab: "سائق",
    tag: "للسائقين",
    title: "اشتغل بمواعيدك",
    text: "سجّل حسابك، واختر من الطلبات المتاحة، وتابع توصيلاتك من لوحة السائق.",
    need: ["إيميل شغّال (يصله رمز تفعيل الحساب)", "رقم موبايل مصري", "كلمة مرور قوية"],
    steps: ["فعّل حسابك بالرمز المرسل إلى إيميلك", "افتح لوحة السائق واختر من الطلبات المتاحة", "وصّل الطلب إلى العميل وتابع سجل توصيلاتك"],
  },
};

const isRole = (v: string | undefined): v is Role => v === "CUSTOMER" || v === "MERCHANT" || v === "DRIVER";
const SLUG: Record<Role, string> = { CUSTOMER: "customer", MERCHANT: "merchant", DRIVER: "driver" };
const FROM_SLUG: Record<string, Role> = { customer: "CUSTOMER", merchant: "MERCHANT", driver: "DRIVER" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: raw } = await searchParams;
  const role: Role = FROM_SLUG[raw ?? ""] ?? (isRole(raw) ? raw : "CUSTOMER");
  const c = ROLES[role];
  const nonce = (await headers()).get("x-nonce") ?? undefined; // reading request headers makes the page dynamic: the environment is read per request, never at build time
  const env = getEnv();
  const siteKey = env.CAPTCHA_PROVIDER === "turnstile" ? (env.TURNSTILE_SITE_KEY ?? null) : null;
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-navy-900 text-white">
        <div className="mx-auto flex w-full max-w-page items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-bold">
            <Logo size={36} priority />
            <span className="text-xl">صقر</span>
          </Link>
          <nav className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold">
            <Link href="/" className="rounded-full px-3 py-2 text-silver hover:text-white">
              <span className="sm:hidden">المتجر</span>
              <span className="hidden sm:inline">العودة إلى المتجر</span>
            </Link>
            <Link href="/login" className="rounded-full bg-accent px-4 py-2 font-bold text-navy-900 hover:bg-accent-hover">تسجيل الدخول</Link>
          </nav>
        </div>
        <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 pb-10 pt-6 sm:px-6">
          <div role="tablist" aria-label="نوع الحساب" className="grid w-full max-w-sm grid-cols-3 gap-1 rounded-full bg-white/10 p-1">
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <Link
                key={r}
                href={`/register?role=${SLUG[r]}`}
                role="tab"
                aria-selected={r === role}
                className={cn("rounded-full px-3 py-2 text-center text-sm font-bold transition-colors", r === role ? "bg-white text-navy-900" : "text-silver hover:text-white")}
              >
                {ROLES[r].tab}
              </Link>
            ))}
          </div>
          <span className="w-fit whitespace-nowrap rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-accent">{c.tag}</span>
          <h1 className="max-w-2xl text-3xl font-bold leading-snug sm:text-4xl">{c.title}</h1>
          <p className="max-w-2xl text-silver">{c.text}</p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-page gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="reg-title" className="rounded-sheet border border-line bg-surface p-5 shadow-card sm:p-8">
          <h2 id="reg-title" className="mb-5 text-xl font-bold">سجّل حسابك</h2>
          <RegisterForm role={role} siteKey={siteKey} nonce={nonce} />
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="mb-3 font-bold">هتحتاج معاك</h2>
            <ul className="flex flex-col gap-2 text-sm text-ink-muted">
              {c.need.map((t) => (
                <li key={t} className="flex gap-2"><span aria-hidden="true" className="text-success">•</span>{t}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="mb-3 font-bold">بعد ما تسجّل</h2>
            <ol className="flex flex-col gap-3 text-sm text-ink-muted">
              {c.steps.map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </section>
          {c.note ? <p className="rounded-card bg-navy-900 p-5 text-sm leading-relaxed text-silver">{c.note}</p> : null}
        </aside>
      </main>
    </div>
  );
}
