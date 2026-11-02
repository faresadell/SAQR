"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Icon } from "./icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "sheet" docks to the bottom on phones (one-hand reach), "dialog" stays centred. */
  variant?: "dialog" | "sheet";
}

/**
 * Accessible modal built on the native <dialog> element: focus is trapped, Esc closes it, and the page behind is inert.
 * Closing by backdrop click is allowed; destructive flows should use <ConfirmDialog>.
 */
export function Modal({ open, onClose, title, children, footer, variant = "dialog" }: ModalProps) {
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
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-sheet border-0 bg-surface p-0 text-ink shadow-pop",
        variant === "sheet" && "max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none",
      )}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="-m-1 rounded-control p-1 text-ink-muted hover:bg-canvas">
            <Icon name="x" />
          </button>
        </div>
        <div className="text-sm text-ink-muted">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation step for destructive or irreversible actions (reset, clear history, approve/reject payment). */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = "إلغاء", tone = "primary", busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      variant="sheet"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
