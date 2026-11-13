import { createHash, randomBytes } from "node:crypto";

/** 256-bit random session token. Only its SHA-256 hash is stored in the database. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
