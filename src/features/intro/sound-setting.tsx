"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { isSoundOn, playFalcon, setSoundOn } from "./falcon-sound";

/** Sound on/off for the opening screen, remembered on this device. Shown as a settings row with a switch. */
export function SoundSetting() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(isSoundOn()), []);
  function toggle() {
    const next = !on;
    setSoundOn(next);
    setOn(next);
    if (next) playFalcon();
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-canvas"
    >
      <span className="min-w-0">
        <span className="block font-semibold text-ink">صوت الصقر عند فتح الموقع</span>
        <span className="block text-sm text-ink-muted">{on ? "مفعّل على هذا الجهاز" : "مكتوم على هذا الجهاز"}</span>
      </span>
      <span aria-hidden="true" className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-line-strong")}>
        <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "end-1" : "start-1")} />
      </span>
    </button>
  );
}
