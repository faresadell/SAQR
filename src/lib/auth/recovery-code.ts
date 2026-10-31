import { createHmac, randomInt } from "node:crypto";

// 10 single-use backup codes per administrator, like "K7QM2-X9TDA" (10 symbols from a 32-letter alphabet without 0/O/1/I/L = 50 bits).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < 10; i += 1) raw += ALPHABET[randomInt(0, ALPHABET.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Accepts lower case, spaces and missing dash. Returns null when it cannot be a code. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.replace(/[\s-]/g, "").toUpperCase();
  if (raw.length !== 10 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Stored only as a keyed hash; the user id is part of the input so one admin's code never matches another's row. */
export function hashRecoveryCode(secret: string, userId: string, code: string): string {
  return createHmac("sha256", secret).update(`saqr-recovery-v1|${userId}|${code}`).digest("hex");
}
