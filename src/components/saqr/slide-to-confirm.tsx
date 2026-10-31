"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

interface SlideToConfirmProps {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}

/**
 * Slide-to-confirm control for irreversible driver actions (pick-up / delivery).
 * Pointer drag completes it; keyboard and assistive tech use Enter/Space on the handle (no drag needed).
 */
export function SlideToConfirm({ label, onConfirm, disabled }: SlideToConfirmProps) {
  const track = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; max: number } | null>(null);
  const dir = useRef(1);
  const HANDLE = 48;

  function onDown(e: PointerEvent<HTMLButtonElement>) {
    if (disabled || !track.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dir.current = getComputedStyle(track.current).direction === "rtl" ? -1 : 1;
    start.current = { x: e.clientX, max: track.current.clientWidth - HANDLE - 8 };
    setDragging(true);
  }
  function onMove(e: PointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    // Direction-agnostic: distance dragged, whichever way the reading direction points.
    const delta = Math.abs(e.clientX - start.current.x);
    setOffset(Math.min(delta, start.current.max));
  }
  function onUp() {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (s && offset >= s.max * 0.9) onConfirm();
    setOffset(0);
  }
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onConfirm();
    }
  }

  return (
    <div ref={track} className={cn("relative flex h-14 items-center overflow-hidden rounded-control bg-canvas px-1", disabled && "opacity-60")}>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center ps-12 text-sm font-semibold text-ink-muted">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label} (اسحب أو اضغط Enter)`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        style={{ transform: `translateX(${offset * dir.current}px)` }}
        className={cn(
          "relative z-10 flex size-12 touch-none items-center justify-center rounded-control bg-navy-900 text-white",
          !dragging && "transition-transform duration-200",
        )}
      >
        <Icon name="chevronLeft" className="size-5" />
      </button>
    </div>
  );
}
