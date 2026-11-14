/**
 * Synthesized sound layers for the opening screen (generated in the browser: no audio files, nothing to license):
 * a soft wind bed that fades in and out, and a deep impact at the moment the light bursts. The falcon cry itself is
 * played by falcon-sound.ts. Browsers only allow audio after a touch, so everything starts from `unlock()`, which must be
 * called inside a user gesture. Every call is safe when audio is missing or blocked: it simply does nothing.
 */
let ctx: AudioContext | null = null;
let wind: { gain: GainNode; stop: () => void } | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a touch/click/keypress handler. Returns whether sound can play. */
export function unlockAudio(): boolean {
  const c = audioContext();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  return true;
}

export function startWind(): void {
  const c = audioContext();
  if (!c || wind) return;
  try {
    const length = c.sampleRate * 2;
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown-ish noise: low, soft rumble
      data[i] = last * 3.5;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 520;
    band.Q.value = 0.6;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 1.6);
    source.connect(band);
    band.connect(gain);
    gain.connect(c.destination);
    source.start();
    wind = { gain, stop: () => { try { source.stop(); } catch { /* already stopped */ } } };
  } catch {
    wind = null;
  }
}

/** Deep impact: a short low sine drop plus a soft noise tail. */
export function playImpact(): void {
  const c = audioContext();
  if (!c) return;
  try {
    const t = c.currentTime + 0.01;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.65, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(env);
    env.connect(c.destination);
    osc.start(t);
    osc.stop(t + 1.4);
  } catch {
    /* ignore */
  }
}

/** Fades the wind out and releases the audio context. */
export function stopAudio(fadeSeconds = 0.6): void {
  const c = ctx;
  if (!c) return;
  try {
    if (wind) {
      wind.gain.gain.cancelScheduledValues(c.currentTime);
      wind.gain.gain.setValueAtTime(Math.max(wind.gain.gain.value, 0.0001), c.currentTime);
      wind.gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + fadeSeconds);
      const w = wind;
      window.setTimeout(() => w.stop(), fadeSeconds * 1000 + 50);
      wind = null;
    }
    window.setTimeout(() => { void c.close().catch(() => undefined); if (ctx === c) ctx = null; }, fadeSeconds * 1000 + 1600);
  } catch {
    /* ignore */
  }
}
