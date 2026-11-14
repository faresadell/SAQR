"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Logo } from "@/components/brand/logo";
import { isSoundOn, playFalcon, setSoundOn } from "./falcon-sound";
import { playImpact, startWind, stopAudio, unlockAudio } from "./intro-audio";

const SEEN = "saqr_intro_seen";
/** Timeline (ms): the logo comes out of the dark, the light bursts (cry + impact), the name is revealed, then it opens into the site. */
const BURST_AT = 2600;
const LEAVE_AT = 7200;
const FADE_OUT_MS = 800;
/** A touch after this moment (when sound is already handled) skips straight into the site. */
const SKIP_BY_TOUCH_AFTER = 3400;

const DUST = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  top: `${(i * 53 + 7) % 100}%`,
  size: 2 + (i % 3),
  delay: `${(i % 6) * 0.7}s`,
  duration: `${9 + (i % 5) * 2}s`,
}));
const SPARKS = Array.from({ length: 16 }, (_, i) => ({ angle: `${i * 22.5}deg`, delay: `${(i % 4) * 25}ms`, distance: `${110 + (i % 3) * 36}px` }));

/**
 * Opening screen, once per browser session, on the home page. A short cinematic sequence in the brand's navy and silver:
 * out of the dark the falcon mark appears, a burst of light and the falcon cry land together, the name is revealed with a
 * silver light sweep, then the screen opens into the site. Sound needs one touch (browsers refuse autoplay): until then the
 * visuals run silently and a quiet hint is shown. Sound can be muted (remembered on the device). "تخطي", Escape or a touch
 * after the burst enter the site. Skipped for people who asked their device for reduced motion.
 */
export function IntroSplash() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [burst, setBurst] = useState(false);
  const [touched, setTouched] = useState(false);
  const [soundOn, setSoundState] = useState(true);
  const started = useRef(performance.now());
  const armed = useRef(false); // touched before the burst: the cry waits for it
  const cryPlayed = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const dust = useMemo(() => DUST, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN) === "1";
      window.sessionStorage.setItem(SEEN, "1");
    } catch {
      /* no storage: show it, it will simply show again next time */
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    started.current = performance.now();
    setSoundState(isSoundOn());
    setOpen(true);
  }, []);

  /** The cry and the impact land together, once. */
  const fireSound = useCallback(() => {
    if (cryPlayed.current || !isSoundOn()) return;
    cryPlayed.current = true;
    playImpact();
    playFalcon();
  }, []);

  // The timeline: burst, then leave. Everything is cleaned up when the screen closes.
  useEffect(() => {
    if (!open) return;
    const burstTimer = window.setTimeout(() => {
      setBurst(true);
      if (armed.current) fireSound();
    }, BURST_AT);
    const leaveTimer = window.setTimeout(() => setLeaving(true), LEAVE_AT);
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      window.clearTimeout(burstTimer);
      window.clearTimeout(leaveTimer);
      document.body.style.overflow = "";
      stopAudio();
    };
  }, [open, fireSound]);

  useEffect(() => {
    if (!leaving) return;
    stopAudio(0.7);
    const timer = window.setTimeout(() => setOpen(false), FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  /** The first touch unlocks sound; later touches (after the burst) enter the site. */
  function handleTouch() {
    if (!touched) {
      setTouched(true);
      if (isSoundOn() && unlockAudio()) {
        startWind();
        if (performance.now() - started.current >= BURST_AT) fireSound();
        else armed.current = true;
        return;
      }
    }
    if (performance.now() - started.current >= SKIP_BY_TOUCH_AFTER) setLeaving(true);
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundState(next);
    setSoundOn(next);
    if (!next) stopAudio(0.2);
    else if (touched && unlockAudio()) startWind();
  }

  if (!open) return null;
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="مرحباً بك في صقر"
      tabIndex={-1}
      onPointerDown={handleTouch}
      onKeyDown={(e) => {
        if (e.key === "Escape") setLeaving(true);
        else if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) handleTouch();
      }}
      className={`intro-stage fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden text-white outline-none ${burst ? "intro-burst" : ""} ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ transition: `opacity ${FADE_OUT_MS}ms ease-in-out` }}
    >
      <div className="intro-glow" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {dust.map((d, i) => (
          <span key={i} className="intro-dust" style={{ left: d.left, top: d.top, width: d.size, height: d.size, animationDelay: d.delay, animationDuration: d.duration }} />
        ))}
      </div>

      <div className="relative flex size-60 items-center justify-center" aria-hidden="true">
        {burst ? (
          <>
            <span className="intro-shock" />
            <span className="intro-shock intro-shock-late" />
            {SPARKS.map((s, i) => (
              <span key={i} className="intro-spark" style={{ "--a": s.angle, "--d": s.distance, animationDelay: s.delay } as CSSProperties} />
            ))}
          </>
        ) : null}
        <Logo size={168} priority className="intro-mark relative" />
      </div>

      <p className="intro-name text-5xl font-extrabold tracking-wide">صقر</p>
      <p className="intro-tagline text-silver">اطلب من منطقتك بسهولة</p>
      {soundOn && !touched ? <p className="intro-hint absolute bottom-10 text-sm text-silver-dim">المس الشاشة لتشغيل الصوت</p> : null}

      <button
        type="button"
        onPointerDown={(e) => { e.stopPropagation(); setLeaving(true); }}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => { if (e.detail === 0) setLeaving(true); }}
        className="absolute end-4 top-4 rounded-control px-3 py-2 text-sm font-semibold text-silver hover:bg-white/10"
      >
        تخطي
      </button>
      <button
        type="button"
        aria-pressed={!soundOn}
        aria-label={soundOn ? "كتم الصوت" : "تشغيل الصوت"}
        onPointerDown={(e) => { e.stopPropagation(); toggleSound(); }}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => { if (e.detail === 0) toggleSound(); }}
        className="absolute start-4 top-4 rounded-control px-3 py-2 text-sm font-semibold text-silver hover:bg-white/10"
      >
        {soundOn ? "الصوت: يعمل" : "الصوت: مكتوم"}
      </button>
    </div>
  );
}
