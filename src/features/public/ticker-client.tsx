"use client";

import { useEffect, useState } from "react";

export function TickerClient({ items }: { items: readonly string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % items.length), 3200);
    return () => window.clearInterval(id);
  }, [items.length]);
  return (
    <div aria-hidden="true" className="flex min-h-11 items-center justify-center gap-2 overflow-hidden rounded-full bg-navy-900 px-4 py-2.5 text-center text-sm font-semibold text-white">
      <span className="text-brand">●</span>
      <span key={i} className="animate-rise-in">{items[i]}</span>
    </div>
  );
}
