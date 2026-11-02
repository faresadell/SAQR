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
}

/** Search box, primary links, cart badge and account link in the public header. */
export function SiteHeaderControls({ signedIn, accountHref }: Props) {
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
      <form onSubmit={onSubmit} role="search" className="relative min-w-0 flex-1">
        <label htmlFor="site-search" className="sr-only">ابحث عن نشاط</label>
        <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-silver-dim" />
        <input
          id="site-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={60}
          placeholder="ابحث عن مطعم أو محل أو عطار"
          className="h-10 w-full rounded-control border border-white/10 bg-white/10 ps-9 pe-3 text-sm text-white placeholder:text-silver-dim"
        />
      </form>
      <nav aria-label="روابط الموقع" className="hidden items-center gap-1 lg:flex">
        <Link href="/explore" className="rounded-control px-3 py-2 text-sm font-semibold text-silver hover:bg-white/10 hover:text-white">استكشف</Link>
        <Link href="/offers" className="rounded-control px-3 py-2 text-sm font-semibold text-silver hover:bg-white/10 hover:text-white">العروض</Link>
      </nav>
      <Link href="/cart" aria-label={hydrated && count > 0 ? `السلة، ${formatNumber(count)} عناصر` : "السلة"} className="relative -m-1 shrink-0 rounded-control p-2 text-white hover:bg-white/10">
        <Icon name="cart" />
        {hydrated && count > 0 ? (
          <span className="num absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">{formatNumber(count)}</span>
        ) : null}
      </Link>
      <Link
        href={accountHref}
        className="hidden shrink-0 items-center gap-2 rounded-control bg-white px-4 py-2 text-sm font-bold text-navy-900 hover:bg-silver sm:inline-flex"
      >
        <Icon name="user" className="size-4" />
        {signedIn ? "حسابي" : "تسجيل الدخول"}
      </Link>
    </>
  );
}
