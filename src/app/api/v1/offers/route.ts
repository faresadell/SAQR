import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, checkMutation, currentActor, mapThrown, readJson, statusForCode } from "@/server/api/http";
import { createOffer, listMyOffers, listPublicOffers } from "@/server/offers/service";

const schema = z.object({ title: z.string().min(3).max(80), description: z.string().max(500).nullable().optional() }).strict();

/**
 * GET /api/v1/offers            running offers of approved shops (public, no sign-in). No prices or discounts: none are defined.
 * GET /api/v1/offers?mine=1     the signed-in shop's own offers with their state (ACTIVE | EXPIRED | STOPPED)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (request.nextUrl.searchParams.get("mine") === "1") {
      const actor = await currentActor();
      if (!actor) return apiError(401, "UNAUTHENTICATED");
      return apiOk({ items: await listMyOffers(actor) });
    }
    return apiOk({ items: await listPublicOffers() });
  } catch (error) {
    return mapThrown(error);
  }
}

/** POST /api/v1/offers {title, description?} — shop creates an offer lasting the base duration (24 h by default). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bad = checkMutation(request);
    if (bad) return bad;
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const body = await readJson(request, schema);
    if (!body.ok) return body.response;
    const result = await createOffer(actor, body.data);
    if (!result.ok) return apiError(statusForCode(result.error), result.error);
    return apiOk({ offerId: result.offerId, endsAt: result.endsAt }, 201);
  } catch (error) {
    return mapThrown(error);
  }
}
