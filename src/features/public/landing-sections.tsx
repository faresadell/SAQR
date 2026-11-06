import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { SectionTitle } from "@/components/ui/page-header";

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

const FAQ: { q: string; a: string }[] = [
  { q: "كيف أطلب من صقر؟", a: "اختر النشاط، أضف المنتجات إلى السلة، أكّد العنوان، ثم حوّل المبلغ وأرفق الإيصال ليراجعه النشاط." },
  { q: "كيف أدفع؟", a: "الدفع حالياً بالتحويل اليدوي عبر فودافون كاش أو إنستا باي. لا يوجد دفع بالبطاقة." },
  { q: "هل أقدر ألغي طلبي؟", a: "نعم قبل أن يبدأ التجهيز. وبعده يُرسل طلب إلغاء ويراجعه النشاط. التفاصيل في سياسة الإلغاء." },
  { q: "ما هي النجوم؟", a: "رصيد بسيط يُستخدم لبدء الطلبات والحفاظ على جودة الخدمة. تُشترى الباقات بالتحويل وتعتمدها الإدارة." },
  { q: "كيف أنضم كتاجر أو سائق؟", a: "أنشئ حساباً واختر نوع حسابك. تراجع الإدارة بياناتك ثم يُفعَّل حسابك." },
];

/** Marketing sections under the home page: audiences, why SAQR, tasbeeh teaser, FAQ. Content only from real platform behaviour; no invented numbers. */
export function LandingSections() {
  return (
    <>
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
    </>
  );
}
