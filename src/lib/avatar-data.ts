export const MAX_AVATAR_BYTES = 80 * 1024;
const PREFIX = "data:image/jpeg;base64,";

/** Accepts only a base64 JPEG data URL up to 80 KB whose bytes really start like a JPEG; returns the bytes or null. */
export function parseAvatarDataUrl(dataUrl: string): Uint8Array | null {
  if (!dataUrl.startsWith(PREFIX) || dataUrl.length > Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + PREFIX.length + 4) return null;
  const b64 = dataUrl.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (bytes.length < 4 || bytes.length > MAX_AVATAR_BYTES) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}
