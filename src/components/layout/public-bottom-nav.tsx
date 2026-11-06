"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/** Phone-only tab bar for the storefront: Home, Products, Offers, Tasbeeh, Settings. */
export function PublicBottomNav() {
  const pathname = usePathname() ?? "/";
  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: "الرئيسية", icon: "home" },
    { href: "/explore", label: "المنتجات", icon: "grid" },
    { href: "/offers", label: "العروض", icon: "tag" },
    { href: "/tasbeeh", label: "التسبيح", icon: "sun" },
    { href: "/settings", label: "الإعدادات", icon: "settings" },
  ];
  return (
    <nav aria-label="التنقل السريع" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors active:scale-95", active ? "text-brand" : "text-ink-muted")}
          >
            {active ? <span aria-hidden="true" className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand" /> : null}
            <Icon name={item.icon} className={cn("size-5 transition-transform", active && "scale-110")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
