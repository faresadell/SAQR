/** Only plain http(s) links may be opened from trip data (blocks javascript:, data:, etc.). */
export function safeExternalUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
