"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { NavGroup, NavItem } from "@/features/shared/nav";

interface DashboardShellProps {
  /** Area name shown under the logo, e.g. "لوحة العميل". */
  areaLabel: string;
  groups: NavGroup[];
  /** Up to four items for the phone bottom bar; the rest live behind "المزيد". */
  mobileItems: NavItem[];
  user: { name: string; subtitle?: string };
  /** Server action that signs the user out. Omitted in the design preview. */
  logoutAction?: () => Promise<void>;
  /** Link back to the public storefront. */
  storefrontHref?: string;
  /** Shown as a ribbon (design preview: "بيانات تجريبية"). */
  ribbon?: string;
  children: ReactNode;
}

function isActive(pathname: string, href: string, rootHref: string): boolean {
  const clean = href.split("#")[0] ?? href;
  if (clean === rootHref) return pathname === clean;
  return pathname === clean || pathname.startsWith(`${clean}/`);
}

function NavLinks({ groups, pathname, rootHref, onNavigate }: { groups: NavGroup[]; pathname: string; rootHref: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="القائمة الرئيسية" className="flex flex-col gap-5">
      {groups.map((g, gi) => (
        <div key={g.title ?? gi} className="flex flex-col gap-1">
          {g.title ? <p className="px-3 pb-1 text-xs font-semibold text-silver-dim">{g.title}</p> : null}
          {g.items.map((item) => {
            const active = isActive(pathname, item.href, rootHref);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors",
                  active ? "bg-white text-navy-900" : "text-silver hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon name={item.icon} className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserCard({ user, logoutAction }: Pick<DashboardShellProps, "user" | "logoutAction">) {
  return (
    <div className="flex items-center gap-3 rounded-control bg-white/5 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white" aria-hidden="true">
        {user.name.trim().charAt(0) || "؟"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{user.name}</p>
        {user.subtitle ? <p className="truncate text-xs text-silver-dim">{user.subtitle}</p> : null}
      </div>
      {logoutAction ? (
        <form action={logoutAction}>
          <button type="submit" aria-label="تسجيل الخروج" className="rounded-control p-2 text-silver hover:bg-white/10 hover:text-white">
            <Icon name="logout" className="size-[18px]" />
          </button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Shared frame for the customer, merchant, driver and admin areas:
 * navy sidebar on desktop, compact top bar + bottom tab bar + drawer on phones.
 */
export function DashboardShell({ areaLabel, groups, mobileItems, user, logoutAction, storefrontHref = "/", ribbon, children }: DashboardShellProps) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const rootHref = groups[0]?.items[0]?.href ?? "/";

  return (
    <div className="min-h-dvh bg-canvas lg:ps-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">
        تخطي إلى المحتوى
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col gap-6 bg-navy-900 p-4 lg:flex">
        <Link href={rootHref} className="flex items-center gap-3 px-2 pt-1 text-white">
          <Logo size={40} />
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-bold">صقر</span>
            <span className="text-xs text-silver-dim">{areaLabel}</span>
          </span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks groups={groups} pathname={pathname} rootHref={rootHref} />
        </div>
        <UserCard user={user} logoutAction={logoutAction} />
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-navy-900 px-4 py-3 text-white lg:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة" aria-haspopup="dialog" className="-m-2 rounded-control p-2 hover:bg-white/10">
          <Icon name="menu" />
        </button>
        <Link href={rootHref} className="flex items-center gap-2 font-bold">
          <Logo size={28} />
          <span>{areaLabel}</span>
        </Link>
        <Link href={storefrontHref} aria-label="العودة إلى المتجر" className="-m-2 rounded-control p-2 hover:bg-white/10">
          <Icon name="store" />
        </Link>
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={areaLabel}>
        <div className="flex min-h-full flex-col gap-5 bg-navy-900 p-4">
          <NavLinks groups={groups} pathname={pathname} rootHref={rootHref} onNavigate={() => setMenuOpen(false)} />
          <div className="mt-auto">
            <UserCard user={user} logoutAction={logoutAction} />
          </div>
        </div>
      </Drawer>

      {ribbon ? <p className="bg-warning-soft px-4 py-2 text-center text-sm font-semibold text-warning-ink">{ribbon}</p> : null}

      <main id="main" className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
        {children}
      </main>

      {/* Phone bottom tabs */}
      <nav aria-label="التنقل السريع" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobileItems.slice(0, 4).map((item) => {
          const active = isActive(pathname, item.href, rootHref);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-brand" : "text-ink-muted")}
            >
              <Icon name={item.icon} className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink-muted">
          <Icon name="menu" className="size-5" />
          المزيد
        </button>
      </nav>
    </div>
  );
}
