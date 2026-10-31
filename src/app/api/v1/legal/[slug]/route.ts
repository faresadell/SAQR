import type { NextResponse } from "next/server";
import { apiOk, mapThrown } from "@/server/api/http";
import { getLegalPage } from "@/server/legal/service";

/** GET /api/v1/legal/{terms|privacy|cancellation|refund|support} — public; 404 for unknown slugs. */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    return apiOk(await getLegalPage((await context.params).slug));
  } catch (error) {
    return mapThrown(error);
  }
}
