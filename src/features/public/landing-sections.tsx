import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { SectionTitle } from "@/components/ui/page-header";
import { Reveal } from "@/components/ui/reveal";
import { FeatureBand } from "./feature-band";
import { TickerClient } from "./ticker-client";

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
        <FeatureBand
          id="customer-title"
          tag="العميل"
          title="اطلب أكثر"
          accent="في سلة واحدة"
          text="اطلب من أكثر من نشاط في نفس الوقت وتابع كل طلب على حدة من القبول حتى التسليم."
          cta="ابدأ التسوق"
          href="/explore"
          image="/images/customer.webp"
          alt="هاتف يعرض واجهة صقر بجوار سلة تسوق وكيس مشتريات"
          width={700}
          height={896}
        />
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
        <FeatureBand
          id="delivery-title"
          tag="التوصيل"
          title="طلبك يوصلك"
          accent="مع سائق صقر"
          text="يوصّل سائق صقر طلبك إلى عنوانك، وتتابع حالته خطوة بخطوة داخل حسابك."
          cta="تتبّع طلباتك"
          href="/account/orders"
          image="/images/delivery.webp"
          alt="صندوق توصيل بشعار صقر وحقيبة سائق وسيارة ودراجات"
          flip
          width={640}
          height={896}
          note="صورة توضيحية"
        />
      </Reveal>

      <Reveal>
        <FeatureBand
          id="categories-title"
          tag="كل احتياجاتك"
          title="تصفّح الأنشطة"
          accent="في مكان واحد"
          text="بدل ما تتنقل بين مواقع كتير، تصفّح الأنشطة المتاحة في صقر واجمع طلبك في سلة واحدة."
          cta="استكشف الأنشطة"
          href="/explore"
          image="/images/categories.webp"
          alt="أيقونات أنشطة: مطاعم وسوبر ماركت وعطارة وصيدليات"
          width={660}
          height={896}
        />
      </Reveal>

      <Reveal>
        <FeatureBand
          id="merchant-title"
          tag="التاجر"
          title="أدر نشاطك"
          accent="من مكانك"
          text="افتح نشاطك، أضف منتجاتك وعروضك، واستقبل طلباتك من لوحة واحدة."
          bullets={["استقبل الطلبات وقرّر قبولها", "أكّد استلام التحويل بعد مراجعة الإيصال", "أضف منتجاتك وعروضك بحدود واضحة", "أضف سائقيك وأسند لهم التوصيل", "تابع تسوياتك وعمولتك"]}
          cta="سجّل نشاطك"
          href="/register"
          image="/images/merchant.webp"
          alt="واجهة محل بشعار صقر وأمامه شاشة لوحة تحكم"
          flip
          width={700}
          height={896}
          note="صورة توضيحية"
        />
      </Reveal>

      <Reveal>
        <FeatureBand
          id="driver-title"
          tag="السائق"
          title="اقبل المشاوير"
          accent="القريبة منك"
          text="اختر من الطلبات المتاحة، واعرف عنوان الاستلام والتسليم قبل أن تبدأ، وتابع توصيلاتك."
          cta="سجّل كسائق"
          href="/register"
          image="/images/driver.webp"
          alt="سائق توصيل بزي صقر يحمل هاتفه بجوار دراجته"
          width={640}
          height={896}
          note="صورة توضيحية"
        />
      </Reveal>

      <Reveal>
        <FeatureBand
          id="screens-title"
          tag="تجربة الاستخدام"
          title="تصفّح أسهل"
          accent="وطلب أسرع"
          text="واجهة مصممة للموبايل: تصفّح الأنشطة، أضف إلى سلتك، وتابع طلبك."
          cta="جرّب الآن"
          href="/explore"
          image="/images/screens.webp"
          alt="تصوّر توضيحي لشاشات موقع صقر على الهاتف"
          flip
          width={660}
          height={896}
          note="تصوّر توضيحي للتصميم وليس لقطات شاشة فعلية"
        />
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

      <Reveal>
        <section aria-labelledby="join-title" className="flex flex-col gap-5">
          <div className="text-center">
            <h2 id="join-title" className="text-2xl font-bold sm:text-3xl">جاهز تجرب صقر؟</h2>
            <p className="text-ink-muted">اختر أنت مين في المنظومة</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-3">
            <li>
              <Link href="/explore" className="flex h-full flex-col gap-2 rounded-card bg-success p-6 text-white shadow-card transition-transform hover:-translate-y-0.5">
                <span className="text-xs font-bold text-white/80">للعميل</span>
                <span className="text-2xl font-bold">اطلب الآن</span>
                <span className="text-sm text-white/90">تصفّح الأنشطة وأضف طلبك إلى السلة.</span>
                <span className="mt-auto pt-3 text-sm font-bold">ابدأ التسوق ←</span>
              </Link>
            </li>
            <li>
              <Link href="/register" className="flex h-full flex-col gap-2 rounded-card bg-navy-900 p-6 text-white shadow-card transition-transform hover:-translate-y-0.5">
                <span className="text-xs font-bold text-emerald-300">للتاجر</span>
                <span className="text-2xl font-bold">سجّل نشاطك</span>
                <span className="text-sm text-silver">افتح متجرك على صقر واستقبل طلباتك.</span>
                <span className="mt-auto pt-3 text-sm font-bold text-emerald-300">ابدأ التسجيل ←</span>
              </Link>
            </li>
            <li>
              <Link href="/register" className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-6 shadow-card transition-transform hover:-translate-y-0.5">
                <span className="text-xs font-bold text-success">للسائق</span>
                <span className="text-2xl font-bold text-navy-900">انضم إلى صقر</span>
                <span className="text-sm text-ink-muted">وصّل الطلبات القريبة منك.</span>
                <span className="mt-auto pt-3 text-sm font-bold text-success">قدّم كسائق ←</span>
              </Link>
            </li>
          </ul>
        </section>
      </Reveal>
    </>
  );
}
