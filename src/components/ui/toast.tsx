"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const toneStyles: Record<ToastTone, string> = {
  success: "bg-success-soft text-success-ink",
  error: "bg-danger-soft text-danger-ink",
  info: "bg-brand-soft text-navy-700",
};

/** Mount once near the root. Messages are announced politely to screen readers and disappear on their own. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = "info") => {
    const id = next.current++;
    setItems((current) => [...current.slice(-2), { id, tone, message }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 5000);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto flex max-w-md items-center gap-2 rounded-control px-4 py-3 text-sm font-semibold shadow-pop animate-rise-in", toneStyles[t.tone])}>
            <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "checkCircle" : "info"} className="size-4" />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Safe outside a provider (tests, previews): calls become no-ops instead of throwing. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => undefined };
}
