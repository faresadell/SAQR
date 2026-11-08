import { db } from "@/lib/db";
import { STORAGE_KEY_PATTERN } from "@/lib/uploads/image-sniff";
import type { PrivateStorage } from "./storage";

/**
 * Private storage in the application's own PostgreSQL database, for a first launch without a separate file service.
 * Files are small (pictures and receipts, at most 5 MB each) and are only ever read through our own authorised routes.
 * Move to an object store (R2) when the database size becomes a concern.
 */
export class DatabaseStorage implements PrivateStorage {
  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    await db.storedFile.create({ data: { key, bytes: Buffer.from(bytes) } }); // a repeated key fails: files are never overwritten
  }

  async get(key: string): Promise<Uint8Array | null> {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    const row = await db.storedFile.findUnique({ where: { key }, select: { bytes: true } });
    return row ? new Uint8Array(row.bytes) : null;
  }
}
