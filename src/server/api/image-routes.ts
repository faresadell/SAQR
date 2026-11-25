import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MAX_RECEIPT_BYTES } from "@/lib/uploads/image-sniff";
import type { Actor } from "@/lib/auth/permissions";
import { apiError, apiOk, checkOrigin, currentActor, mapThrown uploadTooLarge } from "./http";

const STATUS = { INVALID_FILE: 415, FILE_TOO_LARGE: 413 } as const;
type Upload = { ok: true } | { ok: false; error: keyof typeof STATUS };

/** Public picture response: the bytes are sent as an inert image (no sniffing, sandboxed CSP). 404 when there is none. */
export function imageResponse(image: { bytes: Uint8Array; contentType: string } | null): NextResponse {
  if (!image) return apiError(404, "NOT_FOUND");
  return new NextResponse(Buffer.from(image.bytes), {
    headers: { "Content-Type": image.contentType, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "public, max-age=300" },
  });
}

/** POST handler body shared by picture endpoints: origin check, sign-in, size cap, rate limit, one multipart field "file". */
export async function receiveImage(request: NextRequest, rateKeyPrefix: string, save: (actor: Actor, bytes: Uint8Array) => Promise<Upload>): Promise<NextResponse> {
  try {
    const bad = checkOrigin(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const tooLarge = uploadTooLarge(request, MAX_RECEIPT_BYTES);
    if (tooLarge) return tooLarge;
    if (!(await consumeRateLimit(`${rateKeyPrefix}:${actor.id}`, 60, 3600))) return apiError(429, "RATE_LIMITED");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return apiError(422, "VALIDATION_FAILED", "file");
    const result = await save(actor, new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) return apiError(STATUS[result.error], result.error);
    return apiOk({ ok: true }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}

/** Wraps a GET so thrown errors map to API errors like every other route. */
export async function guardedImage(read: () => Promise<{ bytes: Uint8Array; contentType: string } | null>): Promise<NextResponse> {
  try {
    return imageResponse(await read());
  } catch (error) {
    return mapThrown(error);
  }
}
