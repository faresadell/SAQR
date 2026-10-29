import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** 6-digit code from a cryptographically secure generator. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Codes are stored only as keyed hashes bound to the phone and purpose. */
export function hashOtp(secret: string, phone: string, purpose: string, code: string): string {
  return createHmac("sha256", secret).update(`saqr-otp-v1|${purpose}|${phone}|${code}`).digest("hex");
}

export function otpMatches(expectedHex: string, actualHex: string): boolean {
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(actualHex, "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
