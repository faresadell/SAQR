/** Lower-case, trimmed address or null. Deliberately simple: the real proof of ownership is the emailed code. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  return /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email) ? email : null;
}
