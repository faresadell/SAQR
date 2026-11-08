import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "./site-footer";
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
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">
        تخطي إلى المحتوى
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 text-ink shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
            <Logo size={36} priority />
            <span className="text-xl text-navy-900">صقر</span>
          </Link>
          <SiteHeaderControls signedIn={signedIn} accountHref={accountHref} ordersHref={ordersHref} />
        </div>
      </header>

      {ribbon ? <p className="bg-warning-soft px-4 py-2 text-center text-sm font-semibold text-warning-ink">{ribbon}</p> : null}
      <main id="main" className="flex-1">{children}</main>

      <SiteFooter signedIn={signedIn} />

      <PublicBottomNav />
    </div>
  );
}
