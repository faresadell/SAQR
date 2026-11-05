"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isSoundOn, playFalcon, setSoundOn } from "./falcon-sound";

/** Sound on/off for the opening screen, remembered on this device. */
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">صوت الصقر عند فتح الموقع</p>
        <p className="text-sm text-ink-muted">{on ? "مفعّل على هذا الجهاز." : "مكتوم على هذا الجهاز."}</p>
      </div>
      <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={toggle} aria-pressed={on}>{on ? "كتم الصوت" : "تشغيل الصوت"}</Button>
    </div>
  );
}
