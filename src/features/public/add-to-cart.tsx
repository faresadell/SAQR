"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { MAX_LINE_QUANTITY } from "@/features/cart/cart-state";
import { useCart } from "@/features/cart/cart-provider";
import { formatNumber } from "@/lib/format";

export interface AddToCartProps {
  productId: string;
  merchantId: string;
  merchantName: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  /** Show a quantity stepper (product page) or a compact add button (menu rows). */
  withQuantity?: boolean;
}

export function AddToCart({ productId, merchantId, merchantName, name, priceCents, isAvailable, withQuantity = false }: AddToCartProps) {
  const { dispatch } = useCart();
  const toast = useToast();
  const [qty, setQty] = useState(1);

  if (!isAvailable) {
    return <span className="inline-flex h-10 items-center rounded-control bg-canvas px-4 text-sm font-semibold text-ink-muted">غير متاح حالياً</span>;
  }

  function add() {
    dispatch({ type: "add", line: { productId, merchantId, merchantName, name, priceCents }, quantity: qty });
    toast.show(`أُضيف «${name}» إلى السلة`, "success");
    setQty(1);
  }

  if (!withQuantity) {
    return (
      <Button size="sm" onClick={add} aria-label={`أضف ${name} إلى السلة`}>
        <Icon name="plus" className="size-4" />
        أضف
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center rounded-control border border-line-strong bg-surface" role="group" aria-label="الكمية">
        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="تقليل الكمية" className="flex size-11 items-center justify-center rounded-control disabled:opacity-40">
          <Icon name="minus" className="size-4" />
        </button>
        <span className="num min-w-8 text-center font-bold" aria-live="polite">{formatNumber(qty)}</span>
        <button type="button" onClick={() => setQty((q) => Math.min(MAX_LINE_QUANTITY, q + 1))} disabled={qty >= MAX_LINE_QUANTITY} aria-label="زيادة الكمية" className="flex size-11 items-center justify-center rounded-control disabled:opacity-40">
          <Icon name="plus" className="size-4" />
        </button>
      </div>
      <Button onClick={add} size="lg">
        <Icon name="cart" className="size-5" />
        أضف إلى السلة
      </Button>
    </div>
  );
}
