/** Browser-only helper: shrinks a picture to at most `maxSide` pixels and re-encodes it as JPEG. Returns null when the file is not a usable picture. The server still checks the bytes again. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export async function downscaleImage(file: File, maxSide = 1600, quality = 0.82): Promise<File | null> {
  if (!ACCEPTED.includes(file.type) || file.size === 0 || file.size > MAX_INPUT_BYTES) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob || blob.size === 0) return null;
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
