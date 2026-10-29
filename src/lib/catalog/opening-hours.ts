/**
 * Weekly opening hours, evaluated in Cairo time. Day keys follow JavaScript: "0" = Sunday ... "6" = Saturday
 * (the UI labels them in Arabic, starting from Saturday). A day with no intervals is closed.
 * A merchant with NO schedule at all (null) is treated as always open: see docs/PHASE3.md (open decision).
 */
export type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
export interface Interval {
  open: string; // "HH:mm", 24h
  close: string; // "HH:mm" or "24:00"
}
export type OpeningHours = Record<DayKey, Interval[]>;

export const DAY_KEYS: readonly DayKey[] = ["0", "1", "2", "3", "4", "5", "6"];
export const DAY_LABELS_AR: Record<DayKey, string> = {
  "0": "الأحد", "1": "الإثنين", "2": "الثلاثاء", "3": "الأربعاء", "4": "الخميس", "5": "الجمعة", "6": "السبت",
};
/** Egyptian week order for display. */
export const DISPLAY_ORDER: readonly DayKey[] = ["6", "0", "1", "2", "3", "4", "5"];
export const MAX_INTERVALS_PER_DAY = 3;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string): number | null {
  if (time === "24:00") return 1440;
  if (!TIME.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export type HoursResult = { ok: true; value: OpeningHours } | { ok: false; error: "INVALID_HOURS" };

/** Validates untrusted input (e.g. parsed form data or stored JSON) and returns a clean, normalized schedule. */
export function validateOpeningHours(input: unknown): HoursResult {
  const fail: HoursResult = { ok: false, error: "INVALID_HOURS" };
  if (typeof input !== "object" || input === null) return fail;
  const source = input as Record<string, unknown>;
  const clean = {} as OpeningHours;

  for (const day of DAY_KEYS) {
    const raw = source[day];
    if (!Array.isArray(raw) || raw.length > MAX_INTERVALS_PER_DAY) return fail;
    const intervals: { open: string; close: string; from: number; to: number }[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) return fail;
      const { open, close } = item as Record<string, unknown>;
      if (typeof open !== "string" || typeof close !== "string") return fail;
      const from = toMinutes(open);
      const to = toMinutes(close);
      if (from === null || to === null || from >= to || open === "24:00") return fail;
      intervals.push({ open, close, from, to });
    }
    intervals.sort((a, b) => a.from - b.from);
    for (let i = 1; i < intervals.length; i++) {
      if ((intervals[i]?.from ?? 0) < (intervals[i - 1]?.to ?? 0)) return fail; // overlap
    }
    clean[day] = intervals.map(({ open, close }) => ({ open, close }));
  }
  return { ok: true, value: clean };
}

const WEEKDAY: Record<string, DayKey> = { Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6" };

function cairoClock(at: Date): { day: DayKey; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: WEEKDAY[get("weekday")] ?? "0", minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

export function isOpenAt(hours: OpeningHours | null, at: Date): boolean {
  if (hours === null) return true;
  const { day, minutes } = cairoClock(at);
  return hours[day].some((i) => {
    const from = toMinutes(i.open) ?? 0;
    const to = toMinutes(i.close) ?? 0;
    return minutes >= from && minutes < to;
  });
}

/** Build a schedule from form fields: `h:<day>:closed` (checkbox), `h:<day>:open`, `h:<day>:close`. */
export function parseHoursFields(read: (name: string) => string): HoursResult {
  const draft: Record<string, unknown> = {};
  for (const day of DAY_KEYS) {
    if (read(`h:${day}:closed`) === "on") {
      draft[day] = [];
      continue;
    }
    draft[day] = [{ open: read(`h:${day}:open`).trim(), close: read(`h:${day}:close`).trim() }];
  }
  return validateOpeningHours(draft);
}

export function emptyWeek(): OpeningHours {
  return { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] };
}
