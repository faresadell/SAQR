import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — is this deployment configured? Answers only a category (never a name, value or secret):
 *   200 {ok:true}  ·  503 {ok:false, problem:"ENV" | "DATABASE" | "MIGRATIONS"}.
 * The exact cause is written to the server log (Vercel > Logs), where only the owner can read it.
 */
export async function GET(): Promise<NextResponse> {
  const headers = { "Cache-Control": "no-store" };
  try {
    getEnv();
  } catch (error) {
    console.error("health: environment check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, problem: "ENV" }, { status: 503, headers });
  }
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("health: database not reachable:", error instanceof Error ? error.message.split("\n").pop() : error);
    return NextResponse.json({ ok: false, problem: "DATABASE" }, { status: 503, headers });
  }
  try {
    await db.businessType.count();
  } catch (error) {
    console.error("health: tables missing (run prisma migrate deploy):", error instanceof Error ? error.message.split("\n").pop() : error);
    return NextResponse.json({ ok: false, problem: "MIGRATIONS" }, { status: 503, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
