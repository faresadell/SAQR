import { describe, expect, it } from "vitest";
import { createFakeDb } from "@/test/fake-db";
import type { PrismaClient } from "@prisma/client";
import { purgeExpiredAuthData } from "./purge";

const HOUR = 3_600_000;

describe("purgeExpiredAuthData", () => {
  it("removes only old rate-limit hits, old codes and expired sessions", async () => {
    const fake = createFakeDb();
    const now = new Date("2026-11-12T12:00:00Z");
    const ago = (h: number) => new Date(now.getTime() - h * HOUR);

    await fake.rateLimitHit.create({ data: { key: "old", createdAt: ago(30) } });
    await fake.rateLimitHit.create({ data: { key: "fresh", createdAt: ago(2) } });
    await fake.otpCode.create({ data: { phone: "+201000000001", purpose: "SIGNUP", codeHash: "h", expiresAt: ago(29), createdAt: ago(30) } });
    await fake.otpCode.create({ data: { phone: "+201000000002", purpose: "SIGNUP", codeHash: "h", expiresAt: ago(0), createdAt: ago(1) } });
    await fake.session.create({ data: { userId: "u1", tokenHash: "expired", expiresAt: ago(1) } });
    await fake.session.create({ data: { userId: "u2", tokenHash: "live", expiresAt: new Date(now.getTime() + HOUR) } });

    const result = await purgeExpiredAuthData(fake as unknown as PrismaClient, now);
    expect(result).toEqual({ rateLimitHits: 1, otpCodes: 1, sessions: 1 });
    expect(fake.rateLimitHit.rows.map((r) => r.key)).toEqual(["fresh"]);
    expect(fake.otpCode.rows).toHaveLength(1);
    expect(fake.session.rows.map((r) => r.tokenHash)).toEqual(["live"]);
  });

  it("is harmless on empty tables and when run twice", async () => {
    const fake = createFakeDb();
    expect(await purgeExpiredAuthData(fake as unknown as PrismaClient)).toEqual({ rateLimitHits: 0, otpCodes: 0, sessions: 0 });
    expect(await purgeExpiredAuthData(fake as unknown as PrismaClient)).toEqual({ rateLimitHits: 0, otpCodes: 0, sessions: 0 });
  });
});
