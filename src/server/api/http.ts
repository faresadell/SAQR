import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodTypeAny, z } from "zod";
import { getEnv } from "@/lib/env";
import type { Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { getCurrentSession } from "@/server/auth/session";

/** Error body shape for every /api/v1 endpoint: { error: { code, message? } }. */
export function apiError(status: number, code: string, message?: string): NextResponse {
  return NextResponse.json({ error: { code, ...(message ? { message } : {}) } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiOk(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The signed-in user as a service Actor, or null. The identity ALWAYS comes from the session cookie, never from the request body. */
export async function currentActor(): Promise<Actor | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const u = session.user;
  return { id: u.id, role: u.role, isSuperAdmin: u.isSuperAdmin, permissions: u.permissions };
}

/**
 * CSRF defence for cookie-authenticated JSON APIs, on top of SameSite=Lax cookies:
 * state-changing requests must be JSON and must come from our own origin.
 */
export function checkMutation(request: NextRequest): NextResponse | null {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  return checkOrigin(request);
}

/** Origin-only check (used by multipart uploads). */
export function checkOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(getEnv().APP_URL).origin) return apiError(403, "BAD_ORIGIN");
  return null;
}

const MAX_BODY_BYTES = 16 * 1024;

export async function readJson<S extends ZodTypeAny>(request: NextRequest, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, response: apiError(413, "BODY_TOO_LARGE") };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError(400, "INVALID_JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: apiError(422, "VALIDATION_FAILED", parsed.error.issues.map((i) => i.path.join(".")).join(", ")) };
  return { ok: true, data: parsed.data };
}

/** Maps thrown service errors to responses without leaking internals. Unknown errors become a generic 500. */
export function mapThrown(error: unknown): NextResponse {
  if (error instanceof NotFoundError) return apiError(404, "NOT_FOUND");
  if (error instanceof AuthorizationError) return apiError(403, "FORBIDDEN");
  console.error("api error", error instanceof Error ? error.name : "unknown");
  return apiError(500, "INTERNAL_ERROR");
}

/** Service error code -> HTTP status. Anything not listed is a 409 (valid request, wrong state). */
const STATUS_BY_CODE: Record<string, number> = {
  INVALID_REQUEST: 422,
  EMPTY_CART: 422,
  TOO_MANY_LINES: 422,
  INVALID_QUANTITY: 422,
  PRODUCT_NOT_FOUND: 422,
  ADDRESS_NOT_FOUND: 422,
  ZONE_UNAVAILABLE: 422,
  INVALID_FEE: 500,
  ACCOUNT_NOT_ACTIVE: 403,
  PAYMENT_METHOD_DISABLED: 422,
  PAYMENT_RECEIVER_NOT_SET: 422,
  WEAK_PASSWORD: 422,
  DRIVER_NOT_AVAILABLE: 422,
  RATE_LIMITED: 429,
};
export const statusForCode = (code: string): number => STATUS_BY_CODE[code] ?? 409;
