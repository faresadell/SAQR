import "server-only";
import { getEnv } from "@/lib/env";
import { validateImageUpload, type ImageMime, type UploadError } from "./file-validation";
import { newObjectKey, type StorageArea } from "./keys";
import { LocalDiskStorage, type ObjectStorage } from "./local-storage";

export * from "./file-validation";
export * from "./keys";
export * from "./private-response";
export { StorageKeyError, type ObjectStorage } from "./local-storage";

let cached: ObjectStorage | undefined;

/** The configured private storage. Today: a local directory (STORAGE_DIR). */
export function getStorage(): ObjectStorage {
  cached ??= new LocalDiskStorage(getEnv().STORAGE_DIR);
  return cached;
}

export type StoreResult =
  | { ok: true; key: string; mime: ImageMime; size: number; sha256: string }
  | { ok: false; error: UploadError };

/**
 * Validate and store an uploaded image under a generated key. Returns the key to save in the database
 * (receiptKey, imageKey, ...) and a SHA-256 of the content, which later phases use to flag a receipt that is
 * reused for a different order.
 */
export async function storeImageUpload(
  file: { bytes: Uint8Array; declaredType?: string },
  area: StorageArea,
  storage: ObjectStorage = getStorage(),
): Promise<StoreResult> {
  const check = validateImageUpload(file.bytes, file.declaredType);
  if (!check.ok) return check;
  const key = newObjectKey(area, check.extension);
  const saved = await storage.put(key, file.bytes);
  return { ok: true, key, mime: check.mime, size: saved.size, sha256: saved.sha256 };
}

const MIME_BY_EXTENSION: Record<string, ImageMime> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Content type for a stored key, derived from the generated extension (never from user input). */
export function mimeForKey(key: string): ImageMime | null {
  return MIME_BY_EXTENSION[key.slice(key.lastIndexOf(".") + 1)] ?? null;
}
