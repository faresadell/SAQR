import type { ImageMime } from "./file-validation";

/**
 * The only way a stored file should ever be sent to a browser. The caller MUST have verified, on the server, that the
 * signed-in user may see this specific file (for receipts: canViewReceipt). Headers make sure the browser shows the
 * bytes as an image and nothing else, and that no shared cache keeps a private payment proof.
 */
export function privateImageResponse(bytes: Uint8Array, mime: ImageMime): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
