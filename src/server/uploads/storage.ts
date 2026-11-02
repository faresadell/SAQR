import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { STORAGE_KEY_PATTERN } from "@/lib/uploads/image-sniff";
import { R2Storage } from "./r2-storage";

/** Private object storage. Swap the implementation (S3/R2/MinIO) without touching callers. Never served from a public path. */
export interface PrivateStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

class LocalDiskStorage implements PrivateStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes, { flag: "wx", mode: 0o600 }); // never overwrite
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}

let instance: PrivateStorage | undefined;
/** UPLOAD_DIR must be OUTSIDE the web root and persistent (a mounted volume). Default is ./.data/uploads for development. */
export function getStorage(): PrivateStorage {
  if (instance) return instance;
  if (process.env.STORAGE_PROVIDER === "r2") {
    const env = getEnv(); // validated: env.ts requires all four R2 values when STORAGE_PROVIDER=r2
    instance = new R2Storage({ accountId: env.R2_ACCOUNT_ID!, bucket: env.R2_BUCKET!, accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! });
  } else {
    instance = new LocalDiskStorage(process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".data", "uploads"));
  }
  return instance;
}

/** Tests can replace the storage backend. */
export function setStorageForTests(storage: PrivateStorage | undefined): void {
  instance = storage;
}
