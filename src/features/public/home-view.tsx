import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Icon, type IconName } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/format";
import type { PublicOfferView } from "./data";
import { ShopCard } from "./shop-card";
import type { BusinessTypeOption, ShopSummary } from "./types";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "store", title: "اختر نشاطاً", text: "تصفّح المطاعم والمحلات والعطارات في منطقتك." },
  { icon: "cart", title: "اطلب وادفع", text: "أضف ما تريد من أكثر من نشاط، وحوّل المبلغ وأرفق الإيصال." },
  { icon: "truck", title: "استلم طلبك", text: "يقبل سائق طلبك وتتابعه خطوة بخطوة حتى يصل." },
];

/** Home page body: hero, categories, running offers, available shops, how it works, and the invitation to join. Pure: the page loads the data. */
export function HomeView({ types, shops, offers, signedIn }: { types: BusinessTypeOption[]; shops: ShopSummary[]; offers: PublicOfferView[]; signedIn: boolean }) {
  const typeLabel = new Map(types.map((t) => [t.code, t.nameAr]));
  const perType = new Map<string, number>();
  for (const s of shops) perType.set(s.businessType, (perType.get(s.businessType) ?? 0) + 1);
  const featured = shops.slice(0, 6);
  const topOffers = offers.slice(0, 4);
  return (
    <>
      <section className="bg-navy-900 text-white">
        <div className="mx-auto grid w-full max-w-page items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:py-16">
          <div className="flex flex-col gap-5">
            <h1 className="text-3xl font-bold leading-snug sm:text-4xl">اطلب من أكثر من نشاط في سلة واحدة</h1>
            <p className="max-w-xl text-lg text-silver">مطاعم ومحلات وعطارات من منطقتك، تختار منها وتتابع كل طلب على حدة، وسائق يقبل طلبك ويوصله.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/explore" size="lg" className="w-full whitespace-nowrap bg-white text-navy-900 hover:bg-silver sm:w-auto">ابدأ التسوق</LinkButton>
              <LinkButton href="/offers" size="lg" variant="outline" className="w-full whitespace-nowrap border-white/60 bg-transparent text-white hover:bg-white/10 sm:w-auto">العروض النشطة</LinkButton>
            </div>
          </div>
          <div aria-hidden="true" className="relative mx-auto hidden aspect-square w-full max-w-xs items-center justify-center lg:flex">
            <span className="absolute inset-0 rounded-full bg-white/5" />
            <span className="absolute inset-10 rounded-full bg-white/5" />
            <Logo size={176} priority className="relative" />
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-page flex-col gap-10 px-4 py-8 sm:px-6">
        {types.length > 0 ? (
          <section className="flex flex-col gap-4" aria-labelledby="types-title">
            <SectionTitle action={<Link href="/explore" className="text-sm font-semibold text-brand">كل المنتجات</Link>}><span id="types-title">ماذا تريد أن تطلب؟</span></SectionTitle>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {types.map((t) => (
                <li key={t.code}>
                  <Link href={`/explore?type=${encodeURIComponent(t.code)}`} className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card hover:border-brand">
                    <span className="flex size-11 items-center justify-center rounded-control bg-brand-soft text-navy-700"><Icon name="store" /></span>
                    <span className="font-bold">{t.nameAr}</span>
                    <span className="text-sm text-ink-muted">{perType.get(t.code) ? `${perType.get(t.code)} نشاط` : "قريباً"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {topOffers.length > 0 ? (
          <section className="flex flex-col gap-4" aria-labelledby="offers-title">
            <SectionTitle action={<Link href="/offers" className="text-sm font-semibold text-brand">كل العروض</Link>}><span id="offers-title">عروض جارية</span></SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {topOffers.map((o) => (
                <li key={o.id}>
                  <Link href={`/shops/${o.shop.id}`} className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card hover:border-brand">
                    {o.discountLabel ? <span className="w-fit rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success-ink">{o.discountLabel}</span> : <span className="w-fit rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-navy-700">عرض</span>}
                    <span className="font-bold">{o.title}</span>
                    <span className="text-sm text-ink-muted">{o.shop.name}</span>
                    <span className="mt-auto text-xs text-ink-faint">ينتهي {formatDateTime(o.endsAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-4" aria-labelledby="shops-title">
          <SectionTitle action={<Link href="/explore" className="text-sm font-semibold text-brand">عرض الكل</Link>}>
            <span id="shops-title">أنشطة متاحة</span>
          </SectionTitle>
          {featured.length === 0 ? (
            <EmptyState icon="store" title="لا توجد أنشطة معتمدة بعد">ستظهر الأنشطة هنا فور اعتمادها من الإدارة.</EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((s) => (
                <li key={s.id}><ShopCard shop={s} typeLabel={typeLabel.get(s.businessType)} /></li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="how-title">
          <SectionTitle><span id="how-title">كيف يعمل صقر؟</span></SectionTitle>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white"><Icon name={step.icon} className="size-5" /></span>
                <div>
                  <p className="font-bold"><span className="num text-ink-faint">{i + 1}.</span> {step.title}</p>
                  <p className="text-sm text-ink-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {signedIn ? null : (
          <section className="grid gap-3 rounded-card bg-navy-900 p-6 text-white sm:grid-cols-[1fr_auto] sm:items-center" aria-labelledby="join-title">
            <div>
              <h2 id="join-title" className="text-xl font-bold">انضم إلى صقر</h2>
              <p className="text-silver">أنشئ حساباً كعميل لتطلب، أو كتاجر لتبيع، أو كسائق لتوصّل الطلبات وتكسب.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/register" className="bg-white text-navy-900 hover:bg-silver">إنشاء حساب</LinkButton>
              <LinkButton href="/login" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">تسجيل الدخول</LinkButton>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
