/**
 * Validation for user uploads (payment receipts, logos, product and offer images).
 * Nothing the browser says is trusted: the real type is read from the file's own first bytes, the name is ignored
 * (storage keys are generated), and only three raster formats are accepted. SVG, HTML, PDF and anything that could
 * carry script are refused, so a stored file can never run in a visitor's browser.
 */
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB: plenty for a phone screenshot

const EXTENSIONS: Record<ImageMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type UploadError = "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE" | "TYPE_MISMATCH";

export type UploadCheck =
  | { ok: true; mime: ImageMime; extension: string; size: number }
  | { ok: false; error: UploadError };

/** Identify the format from its signature. Returns null for anything that is not JPEG, PNG or WebP. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  // WebP: "RIFF" <size> "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function normalizeDeclared(type: string | undefined): string | null {
  if (!type) return null;
  const t = type.toLowerCase().split(";")[0]?.trim() ?? "";
  return t === "image/jpg" || t === "image/pjpeg" ? "image/jpeg" : t || null;
}

/**
 * Check an uploaded file. `declaredType` is the browser-supplied Content-Type: it is never used to decide anything,
 * only compared with the real type, because a mismatch means a mislabelled (possibly disguised) file.
 */
export function validateImageUpload(bytes: Uint8Array, declaredType?: string, maxBytes: number = MAX_IMAGE_BYTES): UploadCheck {
  if (bytes.length === 0) return { ok: false, error: "EMPTY" };
  if (bytes.length > maxBytes) return { ok: false, error: "TOO_LARGE" };
  const mime = sniffImageMime(bytes);
  if (!mime) return { ok: false, error: "UNSUPPORTED_TYPE" };
  const declared = normalizeDeclared(declaredType);
  if (declared !== null && declared !== mime) return { ok: false, error: "TYPE_MISMATCH" };
  return { ok: true, mime, extension: EXTENSIONS[mime], size: bytes.length };
}

export const UPLOAD_ERROR_AR: Record<UploadError, string> = {
  EMPTY: "الملف فارغ.",
  TOO_LARGE: "حجم الصورة كبير جداً (الحد الأقصى 5 ميجابايت).",
  UNSUPPORTED_TYPE: "الصيغة غير مدعومة. ارفع صورة JPG أو PNG أو WebP.",
  TYPE_MISMATCH: "نوع الملف لا يطابق محتواه.",
};
