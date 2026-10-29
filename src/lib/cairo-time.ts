const CAIRO = "Africa/Cairo";

function cairoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CAIRO, timeZoneName: "longOffset" }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? "0");
  return match[1] === "-" ? -minutes : minutes;
}

/**
 * Interpret a "YYYY-MM-DDTHH:mm" value from a datetime-local input as Cairo time
 * (handles Egypt's daylight saving) and return the exact instant. Null if invalid.
 */
export function parseCairoLocal(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  if (hour > 23 || minute > 59) return null;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const first = naive - cairoOffsetMinutes(new Date(naive)) * 60_000;
  return new Date(naive - cairoOffsetMinutes(new Date(first)) * 60_000);
}

export function formatCairo(date: Date): string {
  return new Intl.DateTimeFormat("ar-EG", { timeZone: CAIRO, dateStyle: "medium", timeStyle: "short" }).format(date);
}
