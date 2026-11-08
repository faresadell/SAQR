/** Database-backed private storage (real PostgreSQL). Uses its own table only. */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DatabaseStorage } from "./database-storage";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const KEY = "product-images/abcdefgh12/123e4567-e89b-12d3-a456-426614174000.jpg";

describe("DatabaseStorage", () => {
  beforeEach(async () => {
    await db.storedFile.deleteMany();
  });

  it("stores bytes and reads them back unchanged", async () => {
    const store = new DatabaseStorage();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10, 0x80]);
    await store.put(KEY, bytes);
    expect(Array.from((await store.get(KEY))!)).toEqual(Array.from(bytes));
  });

  it("returns null for a missing key and never overwrites an existing one", async () => {
    const store = new DatabaseStorage();
    expect(await store.get(KEY)).toBeNull();
    await store.put(KEY, new Uint8Array([1]));
    await expect(store.put(KEY, new Uint8Array([2]))).rejects.toThrow();
    expect(Array.from((await store.get(KEY))!)).toEqual([1]);
  });

  it("refuses keys outside the allowed pattern", async () => {
    const store = new DatabaseStorage();
    await expect(store.put("../etc/passwd", new Uint8Array([1]))).rejects.toThrow("Invalid storage key");
    await expect(store.get("../etc/passwd")).rejects.toThrow("Invalid storage key");
  });
});
