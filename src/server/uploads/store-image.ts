import "server-only";
import { randomUUID } from "node:crypto";
import { detectImage, MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import { getStorage } from "./storage";

export type StoreImageFailure = { ok: false; error: "INVALID_FILE" | "FILE_TOO_LARGE" };

/** Decides the file type from its BYTES (never the name or type the client sent) and stores it under a fresh private key. */
export async function storeCheckedImage(prefix: "product-images" | "offer-images", ownerId: string, bytes: Uint8Array): Promise<{ ok: true; key: string; sizeBytes: number } | StoreImageFailure> {
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
  const kind = detectImage(bytes);
  if (!kind) return { ok: false, error: "INVALID_FILE" };
  const key = `${prefix}/${ownerId}/${randomUUID()}.${kind.ext}`; // a new key each time: nothing is overwritten, caches never show a stale picture
  await getStorage().put(key, bytes);
  return { ok: true, key, sizeBytes: bytes.length };
}

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Reads a stored picture back with its content type; null when missing or the key has an unknown extension. */
export async function readStoredImage(key: string | null | undefined): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!key) return null;
  const bytes = await getStorage().get(key);
  const contentType = TYPES[key.split(".").pop() ?? ""];
  return bytes && contentType ? { bytes, contentType } : null;
}
