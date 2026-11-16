import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const WINDOW_DAYS = 30;
export const windowStart = (now = new Date()) => new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

export interface DayPoint {
  day: string; // YYYY-MM-DD in Cairo time
  count: number;
  cents: number;
}

/** Fills the days that had nothing with zeros so a chart shows real quiet days as quiet. */
export function fillDays(rows: readonly DayPoint[], now = new Date()): DayPoint[] {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: DayPoint[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(now.getTime() - i * 86_400_000));
    out.push(by.get(day) ?? { day, count: 0, cents: 0 });
  }
  return out;
}

export type StatusMoment = "DELIVERED" | "CANCELLED_OR_REJECTED";

/** Orders of one shop whose status event of the given kind happened inside the window. */
export function orderIdsWithEvent(merchantId: string, kind: StatusMoment, since: Date) {
  const statuses = kind === "DELIVERED" ? ["DELIVERED"] : ["CANCELLED", "REJECTED"];
  return db.$queryRaw<{ orderId: string; at: Date }[]>(
    Prisma.sql`SELECT o."id" AS "orderId", MIN(e."createdAt") AS "at" FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId" WHERE e."field" = 'orderStatus' AND e."toValue" IN (${Prisma.join(statuses)}) AND e."createdAt" >= ${since} AND o."merchantId" = ${merchantId} GROUP BY o."id"`,
  );
}

export const cairoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
