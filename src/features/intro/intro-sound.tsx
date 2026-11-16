"use client";

import { useEffect } from "react";
import { isSoundOn, playFalcon } from "./falcon-sound";

const SEEN = "saqr_intro_seen";

/**
 * The start of the site is sound only: no picture, no opening screen. Browsers refuse sound until the person touches the page,
 * so the falcon cry plays once per browser session on the first touch, click or key press. The person can turn it off in settings
 * (remembered on the device). Renders nothing.
 */
export function IntroSound() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SEEN) === "1") return;
    } catch {
      /* no storage: it may play again next visit, that is fine */
    }
    if (!isSoundOn()) return;
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const play = () => {
      for (const e of events) window.removeEventListener(e, play);
      try {
        window.sessionStorage.setItem(SEEN, "1");
      } catch {
        /* ignore */
      }
      playFalcon();
    };
    for (const e of events) window.addEventListener(e, play, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, play);
    };
  }, []);
  return null;
}
