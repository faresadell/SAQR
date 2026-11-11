import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newObjectKey } from "./keys";
import { LocalDiskStorage, StorageKeyError } from "./local-storage";

let dir: string;
let storage: LocalDiskStorage;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "saqr-storage-"));
  storage = new LocalDiskStorage(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LocalDiskStorage", () => {
  it("stores, reads back and deletes an object", async () => {
    const key = newObjectKey("receipts", "png");
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const saved = await storage.put(key, bytes);
    expect(saved.size).toBe(4);
    expect(saved.sha256).toMatch(/^[a-f0-9]{64}$/);

    const read = await storage.get(key);
    expect([...(read?.bytes ?? [])]).toEqual([1, 2, 3, 4]);

    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    await storage.delete(key); // deleting twice is harmless
  });

  it("never overwrites an existing object", async () => {
    const key = newObjectKey("logos", "jpg");
    await storage.put(key, Uint8Array.from([1]));
    await expect(storage.put(key, Uint8Array.from([2]))).rejects.toThrow();
    expect([...((await storage.get(key))?.bytes ?? [])]).toEqual([1]);
  });

  it("returns null for a valid key that does not exist", async () => {
    expect(await storage.get(newObjectKey("offers", "webp"))).toBeNull();
  });

  it("refuses path traversal and arbitrary keys on every operation", async () => {
    for (const bad of ["../escape.png", "/etc/passwd", "receipts/../../x.png", "plain.png"]) {
      await expect(storage.put(bad, Uint8Array.from([1]))).rejects.toBeInstanceOf(StorageKeyError);
      await expect(storage.get(bad)).rejects.toBeInstanceOf(StorageKeyError);
      await expect(storage.delete(bad)).rejects.toBeInstanceOf(StorageKeyError);
    }
  });

  it("writes files readable only by the owner", async () => {
    if (process.platform === "win32") return;
    const key = newObjectKey("receipts", "png");
    await storage.put(key, Uint8Array.from([9]));
    const info = await stat(path.join(dir, key));
    expect(info.mode & 0o077).toBe(0);
  });
});
