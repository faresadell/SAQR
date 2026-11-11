import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isValidObjectKey } from "./keys";

/**
 * Private object storage on a local disk directory that is NOT served by the web server.
 * Files are reachable only through server code that first checks who is asking (see docs/PHASE1.md).
 * The interface is small on purpose so an S3-compatible driver (R2, MinIO, ...) can replace it later
 * without touching the callers.
 */
export interface StoredObject {
  bytes: Buffer;
  size: number;
}

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array): Promise<{ size: number; sha256: string }>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export class StorageKeyError extends Error {
  constructor() {
    super("Invalid storage key");
    this.name = "StorageKeyError";
  }
}

export class LocalDiskStorage implements ObjectStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolve(key: string): string {
    if (!isValidObjectKey(key)) throw new StorageKeyError();
    const full = path.resolve(this.root, key);
    // Defense in depth: even a key that passed the pattern must stay inside the root.
    if (!full.startsWith(this.root + path.sep)) throw new StorageKeyError();
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<{ size: number; sha256: string }> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    // "wx": never overwrite an existing object; owner-only permissions.
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }

  async get(key: string): Promise<StoredObject | null> {
    const target = this.resolve(key);
    try {
      const bytes = await readFile(target);
      return { bytes, size: bytes.length };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    try {
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
