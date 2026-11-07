"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { SafeImage } from "@/components/ui/safe-image";
import { formatEgp } from "@/lib/money";
import { AddToCart } from "./add-to-cart";
import type { MenuProduct } from "./types";

const imageSrc = (p: MenuProduct) => (p.hasImage ? `/api/v1/products/${p.id}/image` : null);

/** One product in a shop menu. Tapping the picture or the name opens a details sheet; the add button adds straight to the basket. */
export function ProductRow({ product, merchantId, merchantName }: { product: MenuProduct; merchantId: string; merchantName: string }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [isOpen, setOpen] = useState(false);
  // The sheet's content exists only while it is open, so the menu page has no hidden duplicates of the name or the add button.
  useEffect(() => {
    const dialog = sheet.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
  }, [isOpen]);
  // A tap on the backdrop (the dialog element itself, outside its content) closes the sheet. Registered here rather than as a JSX handler on a non-interactive element; Escape already closes a modal dialog natively.
  useEffect(() => {
    const dialog = sheet.current;
    if (!dialog) return;
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close();
    };
    dialog.addEventListener("click", onBackdrop);
    return () => dialog.removeEventListener("click", onBackdrop);
  }, []);
  const open = () => setOpen(true);
  const close = () => sheet.current?.close();
  const cart = { productId: product.id, merchantId, merchantName, name: product.nameAr, priceCents: product.priceCents, isAvailable: product.isAvailable };

  return (
    <li className="flex gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
      <button type="button" onClick={open} aria-haspopup="dialog" aria-label={`تفاصيل ${product.nameAr}`} className="shrink-0 rounded-control">
        <SafeImage alt="" src={imageSrc(product)} fallbackIcon="box" className="size-24 rounded-control" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button type="button" onClick={open} aria-haspopup="dialog" className="text-start font-bold text-ink hover:text-brand">
          {product.nameAr}
        </button>
        {product.description ? <p className="line-clamp-2 text-sm text-ink-muted">{product.description}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="num font-bold text-ink">{formatEgp(product.priceCents)}</span>
          <AddToCart {...cart} />
        </div>
      </div>

      <dialog
        ref={sheet}
        aria-label={product.nameAr}
        onClose={() => setOpen(false)}
        className="mb-0 mt-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-sheet bg-surface p-0 text-ink shadow-pop backdrop:bg-navy-950/60 sm:m-auto sm:rounded-sheet"
      >
        {isOpen ? (
          <>
        <div className="relative">
          <SafeImage alt={product.nameAr} src={imageSrc(product)} fallbackIcon="box" className="aspect-[4/3] w-full" />
          <button type="button" onClick={close} aria-label="إغلاق" className="absolute end-3 top-3 flex size-10 items-center justify-center rounded-full bg-surface/95 text-ink shadow-card">
            <Icon name="x" className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold">{product.nameAr}</h2>
            <span className="num shrink-0 text-xl font-bold text-brand">{formatEgp(product.priceCents)}</span>
          </div>
          <p className="text-sm text-ink-muted">من {merchantName}</p>
          {product.description ? <p className="leading-7 text-ink-muted">{product.description}</p> : <p className="text-sm text-ink-faint">لا يوجد وصف لهذا المنتج.</p>}
          <p className="text-xs text-ink-faint">رسوم التوصيل تُحسب منفصلة عند تأكيد الطلب.</p>
          <AddToCart {...cart} withQuantity />
          <Link href={`/shops/${merchantId}/products/${product.id}`} className="text-sm font-semibold text-brand hover:underline">عرض صفحة المنتج</Link>
        </div>
          </>
        ) : null}
      </dialog>
    </li>
  );
}
