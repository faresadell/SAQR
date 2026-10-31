/**
 * Multi-merchant cart: pure logic (no React, no browser APIs) so it is easy to test.
 * The cart only remembers what the customer chose. Prices shown here are DISPLAY ONLY: availability,
 * final prices, delivery fees and totals are decided by the server at checkout.
 */
export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 60;
export const CART_STORAGE_KEY = "saqr.cart.v1";

export interface CartLine {
  productId: string;
  merchantId: string;
  merchantName: string;
  name: string;
  /** Piasters, as shown when the customer added the item. */
  priceCents: number;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
}

export type CartAction =
  | { type: "add"; line: Omit<CartLine, "quantity">; quantity?: number }
  | { type: "setQuantity"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "removeMerchant"; merchantId: string }
  | { type: "clear" }
  | { type: "replace"; state: CartState };

export const emptyCart: CartState = { lines: [] };

function clampQuantity(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(n)));
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const qty = clampQuantity(action.quantity ?? 1);
      const existing = state.lines.find((l) => l.productId === action.line.productId);
      if (existing) {
        return {
          lines: state.lines.map((l) => (l.productId === existing.productId ? { ...l, quantity: clampQuantity(l.quantity + qty) } : l)),
        };
      }
      if (state.lines.length >= MAX_CART_LINES) return state;
      return { lines: [...state.lines, { ...action.line, quantity: qty }] };
    }
    case "setQuantity": {
      if (action.quantity <= 0) return { lines: state.lines.filter((l) => l.productId !== action.productId) };
      return { lines: state.lines.map((l) => (l.productId === action.productId ? { ...l, quantity: clampQuantity(action.quantity) } : l)) };
    }
    case "remove":
      return { lines: state.lines.filter((l) => l.productId !== action.productId) };
    case "removeMerchant":
      return { lines: state.lines.filter((l) => l.merchantId !== action.merchantId) };
    case "clear":
      return emptyCart;
    case "replace":
      return action.state;
  }
}

export interface MerchantGroup {
  merchantId: string;
  merchantName: string;
  lines: CartLine[];
  /** Sum of line totals for this merchant only (display only). Merchants are never merged into one amount. */
  subtotalCents: number;
}

/** One group per merchant, in the order the customer first added from each. */
export function groupByMerchant(lines: readonly CartLine[]): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>();
  for (const line of lines) {
    let g = groups.get(line.merchantId);
    if (!g) {
      g = { merchantId: line.merchantId, merchantName: line.merchantName, lines: [], subtotalCents: 0 };
      groups.set(line.merchantId, g);
    }
    g.lines.push(line);
    g.subtotalCents += line.priceCents * line.quantity;
  }
  return [...groups.values()];
}

export function itemCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

function isLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.productId === "string" && v.productId.length > 0 && v.productId.length <= 64 &&
    typeof v.merchantId === "string" && v.merchantId.length > 0 && v.merchantId.length <= 64 &&
    typeof v.merchantName === "string" && v.merchantName.length <= 120 &&
    typeof v.name === "string" && v.name.length <= 160 &&
    typeof v.priceCents === "number" && Number.isSafeInteger(v.priceCents) && v.priceCents >= 0 &&
    typeof v.quantity === "number" && Number.isInteger(v.quantity) && v.quantity >= 1 && v.quantity <= MAX_LINE_QUANTITY
  );
}

/** Strictly validates stored JSON; anything unexpected yields an empty cart instead of an error. */
export function parseStoredCart(raw: string | null): CartState {
  if (!raw) return emptyCart;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyCart;
    const lines = (parsed as { lines?: unknown }).lines;
    if (!Array.isArray(lines) || lines.length > MAX_CART_LINES) return emptyCart;
    const seen = new Set<string>();
    const valid: CartLine[] = [];
    for (const l of lines) {
      if (!isLine(l) || seen.has(l.productId)) return emptyCart;
      seen.add(l.productId);
      valid.push({ productId: l.productId, merchantId: l.merchantId, merchantName: l.merchantName, name: l.name, priceCents: l.priceCents, quantity: l.quantity });
    }
    return { lines: valid };
  } catch {
    return emptyCart;
  }
}
