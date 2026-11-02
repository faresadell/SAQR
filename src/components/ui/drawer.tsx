"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Edge the panel slides from. "start" is the right edge in RTL. */
  side?: "start" | "end";
}

/** Side panel (mobile navigation, filters). Native <dialog> gives focus trapping and Esc handling. */
export function Drawer({ open, onClose, title, children, side = "start" }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    }
    if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 h-dvh max-h-dvh w-80 max-w-[85vw] border-0 bg-surface p-0 text-ink shadow-pop",
        side === "start" ? "ms-0 me-auto rtl:ms-auto rtl:me-0" : "ms-auto me-0 rtl:ms-0 rtl:me-auto",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-control p-1 text-ink-muted hover:bg-canvas">
            <Icon name="x" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
