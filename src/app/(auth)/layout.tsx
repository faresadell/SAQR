import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3 text-xl font-bold">
          <Logo size={48} priority />
          صقر | SAQR
        </Link>
        <div className="flex flex-col gap-3">
          <p className="text-3xl font-bold leading-snug">منصة التجارة المحلية والتوصيل في مصر</p>
          <p className="max-w-md text-silver">اطلب من أكثر من نشاط في سلة واحدة، وتابع كل طلب على حدة.</p>
        </div>
        <p className="text-sm text-silver-dim">© صقر</p>
      </aside>
      <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <Logo size={72} priority />
          <span className="text-2xl font-bold text-navy-900">صقر</span>
        </div>
        {children}
        <Link href="/" className="text-center text-sm font-semibold text-ink-muted hover:text-ink">العودة إلى المتجر</Link>
      </main>
    </div>
  );
}
