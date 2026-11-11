import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit random session token. Only its SHA-256 hash is stored in the database. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Secret that ties the phone-verification step to the browser that submitted the sign-up form.
 * The raw value lives only in that browser's httpOnly cookie; the database keeps its SHA-256 hash.
 * Without it, someone who merely knows a victim's phone number could overwrite a pending account's password
 * and then rely on the victim to type the SMS code.
 */
export function generateSignupNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSignupNonce(nonce: string): string {
  return createHash("sha256").update(`saqr-signup-v1|${nonce}`).digest("hex");
}

export function signupNonceMatches(storedHashHex: string | null | undefined, nonce: string): boolean {
  if (!storedHashHex) return false;
  const a = Buffer.from(storedHashHex, "hex");
  const b = Buffer.from(hashSignupNonce(nonce), "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
