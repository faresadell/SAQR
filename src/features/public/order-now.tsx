"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/cart/cart-provider";

/** "Order now" on an offer: puts the product in the basket and goes straight to checkout. The server re-prices everything. */
export function OrderNow({ productId, merchantId, merchantName, name, priceCents, isAvailable = true }: { productId: string; merchantId: string; merchantName: string; name: string; priceCents: number; isAvailable?: boolean }) {
  const { dispatch } = useCart();
  const router = useRouter();
  if (!isAvailable) return null;
  return (
    <Button
      size="sm"
      aria-label={`اطلب الآن ${name}`}
      onClick={() => {
        dispatch({ type: "add", line: { productId, merchantId, merchantName, name, priceCents }, quantity: 1 });
        router.push("/checkout");
      }}
    >
      اطلب الآن
    </Button>
  );
}
