import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { SectionTitle } from "@/components/ui/page-header";
import { Reveal } from "@/components/ui/reveal";
import { TickerClient } from "./ticker-client";

const AUDIENCES: { icon: IconName; title: string; text: string; cta: string; href: string; tint: string }[] = [
  { icon: "cart", title: "عميل", text: "اطلب من أكثر من نشاط في سلة واحدة وتابع كل طلب على حدة.", cta: "ابدأ التسوق", href: "/explore", tint: "bg-brand-soft text-navy-700" },
  { icon: "store", title: "تاجر", text: "افتح نشاطك، أضف منتجاتك وعروضك، واستلم طلباتك من لوحة واحدة.", cta: "سجّل كتاجر", href: "/register", tint: "bg-emerald-100 text-emerald-700" },
  { icon: "truck", title: "سائق", text: "اقبل الطلبات القريبة منك وتابع مشاويرك وأرباحك.", cta: "سجّل كسائق", href: "/register", tint: "bg-amber-100 text-amber-700" },
];

const WHY: { icon: IconName; title: string; text: string }[] = [
  { icon: "cart", title: "سلة واحدة", text: "اختر من أكثر من نشاط في طلب واحد." },
  { icon: "navigation", title: "تتبع خطوة بخطوة", text: "تعرف حالة كل طلب من القبول حتى التسليم." },
  { icon: "wallet", title: "دفع بالتحويل", text: "فودافون كاش أو إنستا باي، وتُراجَع الإيصالات قبل التأكيد." },
  { icon: "star", title: "نظام النجوم", text: "نجومك تفتح لك الطلبات، وتحافظ على جودة التعامل." },
  { icon: "shield", title: "حساب محمي", text: "تأكيد رقم الهاتف، وللمشرفين رمز مصادقة إضافي." },
  { icon: "tag", title: "عروض حقيقية", text: "عروض الأنشطة بحدود واضحة، وتختفي تلقائياً عند انتهائها." },
];

const STEPS = [
  { n: "١", title: "اختر النشاط والمنتجات", text: "تصفّح المطاعم والمحلات وأضف ما تريد إلى سلتك." },
  { n: "٢", title: "حوّل المبلغ وأرفق الإيصال", text: "فودافون كاش أو إنستا باي، ويراجع النشاط إيصالك." },
  { n: "٣", title: "تابع طلبك حتى يصلك", text: "تعرف حالة كل طلب، وسائق يوصله إلى عنوانك." },
] as const;

const FAQ: { q: string; a: string }[] = [
  { q: "كيف أطلب من صقر؟", a: "اختر النشاط، أضف المنتجات إلى السلة، أكّد العنوان، ثم حوّل المبلغ وأرفق الإيصال ليراجعه النشاط." },
  { q: "كيف أدفع؟", a: "الدفع حالياً بالتحويل اليدوي عبر فودافون كاش أو إنستا باي. لا يوجد دفع بالبطاقة." },
  { q: "هل أقدر ألغي طلبي؟", a: "نعم قبل أن يبدأ التجهيز. وبعده يُرسل طلب إلغاء ويراجعه النشاط. التفاصيل في سياسة الإلغاء." },
  { q: "ما هي النجوم؟", a: "رصيد بسيط يُستخدم لبدء الطلبات والحفاظ على جودة الخدمة. تُشترى الباقات بالتحويل وتعتمدها الإدارة." },
  { q: "كيف أنضم كتاجر أو سائق؟", a: "أنشئ حساباً واختر نوع حسابك. تراجع الإدارة بياناتك ثم يُفعَّل حسابك." },
];

/** Marketing sections under the home page: audiences, why SAQR, tasbeeh teaser, FAQ. Content only from real platform behaviour; no invented numbers. */
const TICKER = ["سلة واحدة من أكثر من نشاط", "تتبع كل طلب خطوة بخطوة", "دفع بفودافون كاش وإنستا باي", "مطاعم ومحلات وعطارات", "سبّح واقرأ أذكارك"];

/** One highlight at a time, fading in and out. Decorative: hidden from assistive tech. */
export function Ticker() {
  return <TickerClient items={TICKER} />;
}

export function LandingSections() {
  return (
    <>
      <Reveal>
      <section className="flex flex-col gap-4" aria-labelledby="aud-title">
        <SectionTitle><span id="aud-title">صقر لكل طرف</span></SectionTitle>
        <ul className="grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <li key={a.title} style={{ animationDelay: `${i * 80}ms` }} className="animate-rise-in">
              <div className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">
                <span className={`flex size-12 items-center justify-center rounded-full ${a.tint}`}><Icon name={a.icon} className="size-6" /></span>
                <h3 className="text-lg font-bold">{a.title}</h3>
                <p className="text-sm text-ink-muted">{a.text}</p>
                <LinkButton href={a.href} variant="outline" className="mt-auto w-full rounded-full">{a.cta}</LinkButton>
              </div>
            </li>
          ))}
        </ul>
      </section>
      </Reveal>

      <Reveal>
      <section className="flex flex-col gap-4" aria-labelledby="why-title">
        <SectionTitle><span id="why-title">ليه صقر؟</span></SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map((w) => (
            <li key={w.title} className="flex gap-3 rounded-card border border-line bg-surface p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white"><Icon name={w.icon} className="size-5" /></span>
              <div>
                <p className="font-bold">{w.title}</p>
                <p className="text-sm text-ink-muted">{w.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      </Reveal>

      <Reveal>
      <section aria-labelledby="merchant-title" className="relative overflow-hidden rounded-sheet bg-gradient-to-br from-navy-900 to-navy-700 p-6 text-white shadow-pop sm:p-10">
        <span aria-hidden="true" className="absolute -end-16 -top-16 size-64 rounded-full bg-brand/30 blur-2xl" />
        <div className="relative grid items-center gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-bold">للتاجر</span>
            <h2 id="merchant-title" className="text-2xl font-bold leading-snug sm:text-3xl">أدر نشاطك وطلباتك من لوحة واحدة</h2>
            <ul className="flex flex-col gap-2 text-sm text-silver">
              {["استقبل الطلبات وقرّر قبولها", "أكّد استلام التحويل بعد مراجعة الإيصال", "أضف منتجاتك وعروضك بحدود واضحة", "أضف سائقيك وأسند لهم التوصيل", "تابع تسوياتك وعمولتك"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Icon name="check" className="size-4 shrink-0 text-emerald-300" />{t}</li>
              ))}
            </ul>
            <LinkButton href="/register" className="w-fit rounded-full bg-white text-navy-900 hover:bg-silver">سجّل نشاطك</LinkButton>
          </div>
          <div aria-hidden="true" className="flex flex-col gap-3 rounded-card bg-surface p-4 text-ink shadow-pop">
            <div className="flex items-center justify-between"><span className="font-bold">طلبات اليوم</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">مفتوح</span></div>
            {[["طلب جديد", "بانتظار القبول", "bg-amber-100 text-amber-700"], ["قيد التجهيز", "تم تأكيد التحويل", "bg-sky-100 text-sky-700"], ["خرج للتوصيل", "مع السائق", "bg-emerald-100 text-emerald-700"]].map(([a, b, c]) => (
              <div key={a} className="flex items-center justify-between rounded-control border border-line p-3 text-sm">
                <span className="font-semibold">{a}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c}`}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      </Reveal>

      <Reveal>
      <section aria-labelledby="driver-title" className="relative overflow-hidden rounded-sheet bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-pop sm:p-10">
        <span aria-hidden="true" className="absolute -start-16 -bottom-16 size-64 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex flex-col gap-4 md:max-w-xl">
          <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-bold">للسائق</span>
          <h2 id="driver-title" className="text-2xl font-bold leading-snug sm:text-3xl">اقبل المشاوير القريبة منك وتابع توصيلاتك</h2>
          <ul className="flex flex-col gap-2 text-sm text-emerald-50">
            {["اختر من الطلبات المتاحة على اللوحة المفتوحة", "اعرف عنوان الاستلام والتسليم قبل أن تبدأ", "سجّل كل توصيلة وتابع مشاويرك"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Icon name="check" className="size-4 shrink-0" />{t}</li>
            ))}
          </ul>
          <LinkButton href="/register" className="w-fit rounded-full bg-white text-emerald-800 hover:bg-emerald-50">سجّل كسائق</LinkButton>
        </div>
      </section>
      </Reveal>

      <Reveal>
      <section className="flex flex-col gap-4" aria-labelledby="steps-title">
        <SectionTitle><span id="steps-title">كيف تطلب من صقر؟</span></SectionTitle>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((st) => (
            <li key={st.n} className="relative flex flex-col gap-2 rounded-card border border-line bg-surface p-5 pt-9 shadow-card">
              <span className="absolute -top-5 start-5 flex size-11 items-center justify-center rounded-full bg-brand text-xl font-bold text-white shadow-pop">{st.n}</span>
              <h3 className="font-bold">{st.title}</h3>
              <p className="text-sm text-ink-muted">{st.text}</p>
            </li>
          ))}
        </ol>
      </section>
      </Reveal>

      <Reveal>
      <section aria-labelledby="tasbeeh-title">
        <Link href="/tasbeeh" className="relative flex items-center justify-between gap-4 overflow-hidden rounded-sheet bg-gradient-to-l from-emerald-700 to-emerald-900 p-6 text-white shadow-card transition-transform hover:-translate-y-0.5">
          <span aria-hidden="true" className="absolute -start-10 -top-10 size-40 rounded-full bg-white/10" />
          <div className="relative flex flex-col gap-1">
            <h2 id="tasbeeh-title" className="text-xl font-bold">التسبيح والأذكار</h2>
            <p className="text-sm text-emerald-50">سبّح، وخذ أذكار الصباح والمساء وبعد الصلاة والنوم.</p>
          </div>
          <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-white/15"><Icon name="sun" className="size-6" /></span>
        </Link>
      </section>
      </Reveal>

      <Reveal>
      <section className="flex flex-col gap-4" aria-labelledby="faq-title">
        <SectionTitle><span id="faq-title">أسئلة شائعة</span></SectionTitle>
        <div className="flex flex-col gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-card border border-line bg-surface p-4 open:shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold">
                {f.q}
                <Icon name="plus" className="size-4 shrink-0 transition-transform group-open:rotate-45" />
              </summary>
              <p className="mt-2 text-sm text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      </Reveal>
    </>
  );
}
