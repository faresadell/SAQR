"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { useCart } from "@/features/cart/cart-provider";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

/** Phone-only tab bar for the storefront (Home, Explore, Cart, Account). */
export function PublicBottomNav({ accountHref }: { accountHref: string }) {
  const pathname = usePathname() ?? "/";
  const { count, hydrated } = useCart();
  const items: { href: string; label: string; icon: IconName; badge?: number }[] = [
    { href: "/", label: "الرئيسية", icon: "home" },
    { href: "/explore", label: "استكشف", icon: "grid" },
    { href: "/cart", label: "السلة", icon: "cart", badge: hydrated ? count : 0 },
    { href: accountHref, label: "حسابي", icon: "user" },
  ];
  return (
    <nav aria-label="التنقل السريع" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-brand" : "text-ink-muted")}
          >
            <span className="relative">
              <Icon name={item.icon} className="size-5" />
              {item.badge ? <span className="num absolute -end-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{formatNumber(item.badge)}</span> : null}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
