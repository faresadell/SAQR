import Link from "next/link";
import { Logo } from "@/components/brand/logo";

type FooterLink = { href: string; label: string };

const COLUMNS: { title: string; links: (signedIn: boolean) => FooterLink[] }[] = [
  {
    title: "صقر",
    links: () => [
      { href: "/explore", label: "الأنشطة والمنتجات" },
      { href: "/offers", label: "العروض" },
      { href: "/tasbeeh", label: "التسبيح والأذكار" },
      { href: "/settings", label: "الإعدادات" },
    ],
  },
  {
    title: "انضم إلينا",
    links: () => [
      { href: "/register", label: "سجّل نشاطك كتاجر" },
      { href: "/register", label: "اشتغل كسائق" },
    ],
  },
  {
    title: "المساعدة",
    links: () => [{ href: "/legal/support", label: "الدعم والتواصل معنا" }],
  },
  {
    title: "حسابي",
    links: (signedIn) =>
      signedIn
        ? [{ href: "/settings/account", label: "بياناتي" }]
        : [
            { href: "/login", label: "تسجيل الدخول" },
            { href: "/register", label: "إنشاء حساب" },
            { href: "/forgot-password", label: "نسيت كلمة المرور" },
          ],
  },
  {
    title: "قانوني",
    links: () => [
      { href: "/legal/terms", label: "الشروط والأحكام" },
      { href: "/legal/privacy", label: "سياسة الخصوصية" },
      { href: "/legal/cancellation", label: "سياسة الإلغاء" },
      { href: "/legal/refund", label: "سياسة الاسترجاع" },
    ],
  },
];

/** Site footer: brand, grouped links, copyright. Shown on every public page; on phones it leaves room for the bottom tab bar. */
export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="bg-navy-900 pb-20 text-white lg:pb-0">
      <div className="mx-auto grid w-full max-w-page gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_2fr]">
        <div className="flex flex-col gap-4">
          <span className="flex items-center gap-3">
            <Logo size={44} />
            <span className="text-2xl font-bold">صقر</span>
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-silver">
            منصة واحدة تجمع العميل والتاجر والسائق: اطلب من أكثر من نشاط في سلة واحدة، وتابع كل طلب حتى يصلك.
          </p>
        </div>
        <nav aria-label="روابط التذييل" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {COLUMNS.map((c) => (
            <div key={c.title} className="flex flex-col gap-3">
              <h2 className="text-sm font-bold text-emerald-300">{c.title}</h2>
              <ul className="flex flex-col gap-2 text-sm text-silver">
                {c.links(signedIn).map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="hover:text-white">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto w-full max-w-page px-4 py-4 text-xs text-silver/80 sm:px-6">© 2026 صقر | SAQR. جميع الحقوق محفوظة.</p>
      </div>
    </footer>
  );
}
