/** Pure day helpers for the 30-day analytics (no database). */
export const WINDOW_DAYS = 30;
export const windowStart = (now = new Date()) => new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

export interface DayPoint {
  day: string; // YYYY-MM-DD in Cairo time
  count: number;
  cents: number;
}

/** Fills the days that had nothing with zeros so a chart shows real quiet days as quiet. */
export function fillDays(rows: readonly DayPoint[], now = new Date()): DayPoint[] {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: DayPoint[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(now.getTime() - i * 86_400_000));
    out.push(by.get(day) ?? { day, count: 0, cents: 0 });
  }
  return out;
}

export const cairoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
