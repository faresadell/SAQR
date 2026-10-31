"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { CART_STORAGE_KEY, cartReducer, emptyCart, itemCount, parseStoredCart, type CartAction, type CartLine, type CartState } from "./cart-state";

interface CartApi {
  lines: CartLine[];
  count: number;
  /** False until the saved cart has been read in the browser (avoids a server/client mismatch flash). */
  hydrated: boolean;
  dispatch: (action: CartAction) => void;
}

const CartContext = createContext<CartApi | null>(null);

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return null; // private mode / blocked storage: the cart still works for this page view
  }
}

function writeStorage(state: CartState): void {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: ignore, the in-memory cart keeps working */
  }
}

/** Keeps the cart in memory and mirrors it to this browser's localStorage (per device, never synced to the server). */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, emptyCart);
  const [hydrated, setHydrated] = useState(false);
  const skipFirstWrite = useRef(true);

  useEffect(() => {
    dispatch({ type: "replace", state: parseStoredCart(readStorage()) });
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) dispatch({ type: "replace", state: parseStoredCart(e.newValue) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipFirstWrite.current) {
      skipFirstWrite.current = false;
      return;
    }
    writeStorage(state);
  }, [state, hydrated]);

  const stableDispatch = useCallback((action: CartAction) => dispatch(action), []);
  const api = useMemo<CartApi>(() => ({ lines: state.lines, count: itemCount(state.lines), hydrated, dispatch: stableDispatch }), [state.lines, hydrated, stableDispatch]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

const FALLBACK: CartApi = { lines: [], count: 0, hydrated: false, dispatch: () => undefined };

/** Safe outside a provider (returns an empty, inert cart). */
export function useCart(): CartApi {
  return useContext(CartContext) ?? FALLBACK;
}
