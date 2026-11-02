import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Icon } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { ShopCard } from "./shop-card";
import type { BusinessTypeOption, ShopSummary } from "./types";

/** Home page body (hero, categories, shops). Pure: the page loads the data. */
export function HomeView({ types, shops }: { types: BusinessTypeOption[]; shops: ShopSummary[] }) {
  const typeLabel = new Map(types.map((t) => [t.code, t.nameAr]));
  const featured = shops.slice(0, 6);
  return (
    <>
      <section className="bg-navy-900 text-white">
        <div className="mx-auto grid w-full max-w-page items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:py-16">
          <div className="flex flex-col gap-5">
            <h1 className="text-3xl font-bold leading-snug sm:text-4xl">اطلب من أكثر من نشاط في سلة واحدة</h1>
            <p className="max-w-xl text-lg text-silver">مطاعم ومحلات وعطارات من منطقتك، تختار منها وتتابع كل طلب على حدة.</p>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/explore" size="lg" className="bg-white text-navy-900 hover:bg-silver">استكشف الأنشطة</LinkButton>
              <LinkButton href="/offers" size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">العروض النشطة</LinkButton>
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
            <SectionTitle><span id="types-title">التصنيفات</span></SectionTitle>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {types.map((t) => (
                <li key={t.code}>
                  <Link href={`/explore?type=${encodeURIComponent(t.code)}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 font-semibold shadow-card hover:border-brand">
                    <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-navy-700"><Icon name="store" /></span>
                    {t.nameAr}
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
      </div>
    </>
  );
}
