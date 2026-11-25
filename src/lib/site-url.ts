/** Public base URL, safe to read at build time (does not require the full environment to be valid). */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "https://www.saqr.sale").replace(/\/$/, "");
}
