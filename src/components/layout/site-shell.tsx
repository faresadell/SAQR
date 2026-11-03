import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { getCurrentSession } from "@/server/auth/session";
import { SiteHeaderControls } from "./site-header-controls";
import { PublicBottomNav } from "./public-bottom-nav";

const roleHome = { CUSTOMER: "/account", MERCHANT: "/merchant", DRIVER: "/driver", ADMIN: "/admin" } as const;
const roleOrders = { CUSTOMER: "/account/orders", MERCHANT: "/merchant/orders", DRIVER: "/driver/tasks", ADMIN: "/admin/orders" } as const;

/** Resolves the session, then renders the frame. Pages use this. */
export async function SiteShell({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  return (
    <SiteFrame accountHref={session ? roleHome[session.user.role] : "/login"} ordersHref={session ? roleOrders[session.user.role] : "/login"} signedIn={Boolean(session)}>
      {children}
    </SiteFrame>
  );
}

/** Public storefront frame: header (logo, search, cart, account), footer, and a bottom tab bar on phones. Pure: no data access. */
export function SiteFrame({ children, accountHref, ordersHref = "/login", signedIn, ribbon }: { children: ReactNode; accountHref: string; ordersHref?: string; signedIn: boolean; ribbon?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">
        تخطي إلى المحتوى
      </a>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-900 text-white">
        <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
            <Logo size={36} priority />
            <span className="text-lg">صقر</span>
          </Link>
          <SiteHeaderControls signedIn={signedIn} accountHref={accountHref} ordersHref={ordersHref} />
        </div>
      </header>

      {ribbon ? <p className="bg-warning-soft px-4 py-2 text-center text-sm font-semibold text-warning-ink">{ribbon}</p> : null}
      <main id="main" className="flex-1 pb-20 lg:pb-0">{children}</main>

      <footer className="hidden border-t border-line bg-surface lg:block">
        <div className="mx-auto flex w-full max-w-page flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-ink-muted">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Logo size={24} />
            صقر | SAQR
          </span>
          <nav aria-label="روابط التذييل" className="flex flex-wrap gap-5">
            <Link href="/explore" className="hover:text-ink">المنتجات</Link>
            <Link href="/offers" className="hover:text-ink">العروض</Link>
            <Link href="/legal/privacy" className="hover:text-ink">سياسة الخصوصية</Link>
            <Link href="/legal/terms" className="hover:text-ink">الشروط والأحكام</Link>
            <Link href="/legal/cancellation" className="hover:text-ink">الإلغاء</Link>
            <Link href="/legal/refund" className="hover:text-ink">الاسترجاع</Link>
            <Link href="/legal/support" className="hover:text-ink">الدعم</Link>
          </nav>
        </div>
      </footer>

      <PublicBottomNav />
    </div>
  );
}
