import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { Icon } from "./icon";

interface PaginationProps {
  page: number;
  pageCount: number;
  /** Builds the URL for a page number, e.g. (p) => `/admin/users?page=${p}`. */
  hrefFor: (page: number) => string;
}

/** Link-based pagination (works without JavaScript and is shareable). */
export function Pagination({ page, pageCount, hrefFor }: PaginationProps) {
  if (pageCount <= 1) return null;
  const prev = page > 1 ? page - 1 : null;
  const next = page < pageCount ? page + 1 : null;
  const linkClass = "inline-flex h-10 items-center gap-1 rounded-control border border-line bg-surface px-3 text-sm font-semibold hover:bg-canvas";
  return (
    <nav aria-label="التنقل بين الصفحات" className="flex items-center justify-between gap-3">
      {prev ? (
        <Link href={hrefFor(prev)} className={linkClass} rel="prev">
          <Icon name="chevronRight" className="size-4" />
          السابق
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-50")} aria-disabled="true">السابق</span>
      )}
      <span className="num text-sm text-ink-muted" aria-current="page">
        صفحة {formatNumber(page)} من {formatNumber(pageCount)}
      </span>
      {next ? (
        <Link href={hrefFor(next)} className={linkClass} rel="next">
          التالي
          <Icon name="chevronLeft" className="size-4" />
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-50")} aria-disabled="true">التالي</span>
      )}
    </nav>
  );
}
