"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { playFalcon } from "./falcon-sound";

const SEEN = "saqr_intro_seen";
const AUTO_CLOSE_MS = 4200;

/**
 * Opening screen shown once per browser session, on the home page: the falcon swoops in with an animation and a cry.
 * Touch anywhere (or "تخطي") to enter. Skipped for people who asked their device for reduced motion.
 */
export function IntroSplash() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const played = useRef(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN) === "1";
      window.sessionStorage.setItem(SEEN, "1");
    } catch {
      /* no storage: show it, it will simply show again next time */
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOpen(true);
    const timer = window.setTimeout(() => setLeaving(true), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setOpen(false), 450);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  function enter() {
    if (!played.current) {
      played.current = true;
      playFalcon(); // allowed now: the person touched the page
    }
    window.setTimeout(() => setLeaving(true), 900);
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="مرحباً بك في صقر"
      onPointerDown={enter}
      className={`fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-6 bg-navy-900 text-white transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}
    >
      <div className="relative flex size-56 items-center justify-center">
        <span className="absolute inset-0 animate-[ring-expand_2.4s_ease-out_infinite] rounded-full border border-white/25" />
        <span className="absolute inset-6 animate-[ring-expand_2.4s_ease-out_0.8s_infinite] rounded-full border border-white/20" />
        <Logo size={160} priority className="relative animate-[falcon-in_1.4s_cubic-bezier(0.2,0.8,0.2,1)_both]" />
      </div>
      <p className="animate-[text-in_1s_ease-out_0.9s_both] text-4xl font-bold tracking-wide">صقر</p>
      <p className="animate-[text-in_1s_ease-out_1.3s_both] text-silver">اطلب من منطقتك بسهولة</p>
      <p className="animate-[text-in_1s_ease-out_2s_both] text-sm text-silver-dim">المس الشاشة للدخول</p>
      <button
        type="button"
        onPointerDown={(e) => { e.stopPropagation(); setLeaving(true); }}
        className="absolute end-4 top-4 rounded-control px-3 py-2 text-sm font-semibold text-silver hover:bg-white/10"
      >
        تخطي
      </button>
    </div>
  );
}
