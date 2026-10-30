import { timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, apiOk } from "@/server/api/http";
import { escalateOverdueRefunds } from "@/server/refunds/service";
import { runDailyStarCharge, runMonthlyRewards, runPlanReminders } from "@/server/stars/jobs";

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * POST /api/internal/jobs/daily-stars | monthly-rewards | plan-reminders   (Authorization: Bearer $CRON_SECRET)
 * For the scheduler only (not for browsers). Both jobs are idempotent; call them as often as you like
 * (suggested: daily-stars hourly, monthly-rewards hourly). Disabled with 503 until CRON_SECRET is set.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ job: string }> }): Promise<NextResponse> {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return apiError(503, "JOBS_DISABLED");
  if (!authorized(request, secret)) return apiError(401, "UNAUTHENTICATED");
  const { job } = await context.params;
  if (job === "daily-stars") return apiOk(await runDailyStarCharge());
  if (job === "monthly-rewards") return apiOk(await runMonthlyRewards());
  if (job === "refund-overdue") return apiOk(await escalateOverdueRefunds());
  if (job === "plan-reminders") return apiOk(await runPlanReminders());
  return apiError(404, "NOT_FOUND");
}
