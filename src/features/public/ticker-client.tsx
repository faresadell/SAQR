"use client";

/** A slow, endless strip of highlights with faded edges, so no word is ever cut off hard. Decorative. Still for reduced motion. */
export function TickerClient({ items }: { items: readonly string[] }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-full bg-navy-900 py-2.5 text-sm font-semibold text-white [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
    >
      <div className="flex w-max animate-marquee motion-reduce:animate-none">
        {[0, 1].map((n) => (
          <div key={n} className="flex shrink-0 items-center gap-8 pe-8">
            {[...items, ...items].map((t, i) => (
              <span key={i} className="flex items-center gap-8 whitespace-nowrap">
                {t}
                <span className="text-brand">●</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
