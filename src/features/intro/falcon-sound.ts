/**
 * Falcon cry for the opening screen. If a real recording is placed at `public/sounds/falcon.mp3` it is played; otherwise a short
 * synthesized cry is used (generated in the browser, no file needed). Browsers only allow sound after the person touches the page.
 * The on/off choice is a per-device convenience kept in localStorage (every access is wrapped: it can throw or be empty).
 */
const KEY = "saqr_sound";

export function isSoundOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: the choice just lasts until reload */
  }
}

function synthesizeCry(): void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const start = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 5200;
  filter.connect(master);
  for (let i = 0; i < 4; i += 1) {
    const t = start + i * 0.17;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(3300 - i * 120, t);
    osc.frequency.exponentialRampToValueAtTime(1700, t + 0.13);
    const vibrato = ctx.createOscillator();
    const vibratoDepth = ctx.createGain();
    vibrato.frequency.value = 38;
    vibratoDepth.gain.value = 140;
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(env);
    env.connect(filter);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + 0.17);
    vibrato.stop(t + 0.17);
  }
  window.setTimeout(() => void ctx.close(), 1500);
}

/** Plays once if the person has not switched sound off. Never throws. */
export function playFalcon(): void {
  if (!isSoundOn()) return;
  try {
    const audio = new Audio("/sounds/falcon.mp3");
    audio.volume = 0.7;
    audio.addEventListener("error", () => { try { synthesizeCry(); } catch { /* no audio available */ } }, { once: true });
    void audio.play().catch(() => { try { synthesizeCry(); } catch { /* blocked or unsupported */ } });
  } catch {
    try { synthesizeCry(); } catch { /* ignore */ }
  }
}
