/** Display-only formatting helpers (Arabic, Cairo time). Never feed results back into calculations. */

const NUM = new Intl.NumberFormat("ar-EG");

export function formatNumber(value: number): string {
  return NUM.format(value);
}

/** Arabic plural forms for a count: 1 → one, 2 → two, 3–10 → few, 11+ → many. */
export function arabicCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  const abs = Math.abs(n);
  if (abs === 1) return forms.one;
  if (abs === 2) return forms.two;
  if (abs >= 3 && abs <= 10) return `${formatNumber(n)} ${forms.few}`;
  return `${formatNumber(n)} ${forms.many}`;
}

/** "نجمة واحدة" / "نجمتان" / "٥ نجوم" / "١٢ نجمة". */
export function starsLabel(n: number): string {
  return arabicCount(n, { one: "نجمة واحدة", two: "نجمتان", few: "نجوم", many: "نجمة" });
}

const DATE = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeZone: "Africa/Cairo" });
const DATE_TIME = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" });

export function formatDate(value: Date | string): string {
  return DATE.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: Date | string): string {
  return DATE_TIME.format(typeof value === "string" ? new Date(value) : value);
}
