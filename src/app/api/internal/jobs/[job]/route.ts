import { timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, apiOk } from "@/server/api/http";
import { runMembershipMaintenance } from "@/server/memberships/service";
import { generateSettlements, previousMonthKey } from "@/server/settlements/service";
import { escalateOverdueRefunds } from "@/server/refunds/service";
import { runDailyStarCharge, runMonthlyRewards, runPlanReminders } from "@/server/stars/jobs";

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Every periodic job once, in order. One failing job never stops the others; the result names which ones failed. All are idempotent. */
async function runAllJobs(): Promise<Record<string, unknown>> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["membership-maintenance", () => runMembershipMaintenance()],
    ["daily-stars", () => runDailyStarCharge()],
    ["plan-reminders", () => runPlanReminders()],
    ["refund-overdue", () => escalateOverdueRefunds()],
    ["monthly-rewards", () => runMonthlyRewards()],
    ["settlements", async () => {
      const result = await generateSettlements(previousMonthKey(), null);
      return result.ok ? result.summary : { skipped: result.error };
    }],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, run] of steps) {
    try {
      out[name] = await run();
    } catch (error) {
      console.error(`job ${name} failed`, error);
      out[name] = { failed: true };
    }
  }
  return out;
}

/**
 * POST /api/internal/jobs/all  (everything, once: the simplest thing to schedule: hourly or daily)
 * POST /api/internal/jobs/daily-stars | monthly-rewards | plan-reminders   (Authorization: Bearer $CRON_SECRET)
 * For the scheduler only (not for browsers). Both jobs are idempotent; call them as often as you like
 * (suggested: daily-stars hourly, monthly-rewards hourly). Disabled with 503 until CRON_SECRET is set.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ job: string }> }): Promise<NextResponse> {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return apiError(503, "JOBS_DISABLED");
  if (!authorized(request, secret)) return apiError(401, "UNAUTHENTICATED");
  const { job } = await context.params;
  if (job === "all") return apiOk(await runAllJobs());
  if (job === "daily-stars") return apiOk(await runDailyStarCharge());
  if (job === "monthly-rewards") return apiOk(await runMonthlyRewards());
  if (job === "refund-overdue") return apiOk(await escalateOverdueRefunds());
  if (job === "membership-maintenance") return apiOk(await runMembershipMaintenance());
  if (job === "settlements") {
    const result = await generateSettlements(previousMonthKey(), null);
    return result.ok ? apiOk(result.summary) : apiError(409, result.error);
  }
  if (job === "plan-reminders") return apiOk(await runPlanReminders());
  return apiError(404, "NOT_FOUND");
}
