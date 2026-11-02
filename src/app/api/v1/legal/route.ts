import type { NextResponse } from "next/server";
import { apiOk, mapThrown } from "@/server/api/http";
import { listLegalPages } from "@/server/legal/service";

/** GET /api/v1/legal — public. Every page with `approved`; show a clear "draft" label while approved=false. */
export async function GET(): Promise<NextResponse> {
  try {
    return apiOk({ items: await listLegalPages() });
  } catch (error) {
    return mapThrown(error);
  }
}
