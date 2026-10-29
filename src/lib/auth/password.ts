import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt is built into Node (no native dependency). Parameters follow OWASP guidance
// (N=2^15, r=8, p=3). Stored format: scrypt$N$r$p$salt$hash (base64).
const KEY_LENGTH = 64;
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const MAX_MEMORY = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: MAX_MEMORY }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  const validN = Number.isInteger(N) && N >= 2 ** 14 && N <= 2 ** 17 && (N & (N - 1)) === 0;
  if (!validN || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 8) return false;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, Buffer.from(saltB64, "base64"), { N, r, p });
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/** Spend the same time as a real check so login timing does not reveal whether an account exists. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("saqr-timing-equalizer");
  await verifyPassword(password, await dummyHash);
}

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "ALL_DIGITS" | "COMMON" | "SAME_AS_PHONE";

const COMMON = new Set([
  "password", "password1", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
  "11111111", "iloveyou", "abc12345", "saqr1234", "00000000", "admin123",
]);

export function checkPasswordStrength(password: string, phone?: string): PasswordProblem | null {
  if (password.length < 8) return "TOO_SHORT";
  if (password.length > 128) return "TOO_LONG";
  if (/^\d+$/.test(password)) return "ALL_DIGITS";
  if (COMMON.has(password.toLowerCase())) return "COMMON";
  if (phone && password.replace(/\D/g, "") === phone.replace(/\D/g, "")) return "SAME_AS_PHONE";
  return null;
}
