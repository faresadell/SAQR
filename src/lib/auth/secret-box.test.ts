import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "./secret-box";

describe("secret box", () => {
  const key = randomBytes(32);

  it("round-trips a secret", () => {
    const secret = randomBytes(20);
    expect(decryptSecret(key, encryptSecret(key, secret)).equals(secret)).toBe(true);
  });

  it("produces different ciphertext each time", () => {
    const secret = randomBytes(20);
    expect(encryptSecret(key, secret)).not.toBe(encryptSecret(key, secret));
  });

  it("fails on a wrong key or tampered data", () => {
    const payload = encryptSecret(key, randomBytes(20));
    expect(() => decryptSecret(randomBytes(32), payload)).toThrow();
    const parts = payload.split(".");
    parts[3] = Buffer.from("tampered-bytes").toString("base64url");
    expect(() => decryptSecret(key, parts.join("."))).toThrow();
    expect(() => decryptSecret(key, "v2.a.b.c")).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => parseEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow();
    expect(parseEncryptionKey(key.toString("base64")).length).toBe(32);
  });
});
