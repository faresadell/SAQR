"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { useCart } from "@/features/cart/cart-provider";
import { formatNumber } from "@/lib/format";

interface Props {
  signedIn: boolean;
  accountHref: string;
  /** Where "طلباتي" goes for the signed-in role (customer orders, shop orders, driver tasks, admin orders). */
  ordersHref: string;
}

const ghost = "rounded-control px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-canvas hover:text-ink";

/**
 * Public header: search, primary links, "طلباتي" button, the basket (only while it holds items), and the account
 * buttons (تسجيل دخول / إنشاء حساب when signed out). On phones the search box drops to its own row.
 */
export function SiteHeaderControls({ signedIn, accountHref, ordersHref }: Props) {
  const router = useRouter();
  const { count, hydrated } = useCart();
  const [q, setQ] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/explore");
  }

  return (
    <>
      <nav aria-label="روابط الموقع" className="hidden items-center gap-1 lg:flex">
        <Link href="/" className={ghost}>الرئيسية</Link>
        <Link href="/explore" className={ghost}>المنتجات</Link>
        <Link href="/offers" className={ghost}>العروض</Link>
        <Link href="/tasbeeh" className={ghost}>التسبيح</Link>
        <Link href="/settings" className={ghost}>الإعدادات</Link>
      </nav>

      <form onSubmit={onSubmit} role="search" className="relative order-last min-w-0 basis-full lg:order-none lg:basis-0 lg:flex-1">
        <label htmlFor="site-search" className="sr-only">ابحث عن نشاط</label>
        <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          id="site-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={60}
          placeholder="ابحث عن مطعم أو محل أو عطار"
          className="h-11 w-full rounded-full border border-line-strong bg-canvas ps-10 pe-4 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:bg-surface"
        />
      </form>

      <div className="ms-auto flex items-center gap-1.5 lg:ms-0">
        {hydrated && count > 0 ? (
          <Link href="/cart" aria-label={`السلة، ${formatNumber(count)} عناصر`} className="relative rounded-control p-2 text-ink hover:bg-canvas">
            <Icon name="cart" />
            <span className="num absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">{formatNumber(count)}</span>
          </Link>
        ) : null}
        {signedIn ? (
          <Link href={ordersHref} aria-label="طلباتي" className="inline-flex items-center gap-1.5 rounded-control p-2 text-ink hover:bg-canvas sm:px-3">
            <Icon name="box" />
            <span className="hidden text-sm font-semibold sm:inline">طلباتي</span>
          </Link>
        ) : null}
        {signedIn ? (
          <Link href={accountHref} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-navy-900 px-3 py-2 text-sm font-bold text-white hover:bg-navy-800 sm:px-4">
            <Icon name="user" className="size-4" />
            حسابي
          </Link>
        ) : (
          <>
            <Link href="/login" className="shrink-0 rounded-full px-3 py-2 text-sm font-bold text-ink hover:bg-canvas">تسجيل دخول</Link>
            <Link href="/register" className="shrink-0 rounded-full bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-hover sm:px-4">إنشاء حساب</Link>
          </>
        )}
      </div>
    </>
  );
}
