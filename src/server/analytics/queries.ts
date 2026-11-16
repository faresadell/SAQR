import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type StatusMoment = "DELIVERED" | "CANCELLED_OR_REJECTED";

/** Orders (of one shop, or of every shop when merchantId is null) whose status event of the given kind happened inside the window. */
export function orderIdsWithEvent(merchantId: string | null, kind: StatusMoment, since: Date) {
  const statuses = kind === "DELIVERED" ? ["DELIVERED"] : ["CANCELLED", "REJECTED"];
  return db.$queryRaw<{ orderId: string; at: Date }[]>(
    Prisma.sql`SELECT o."id" AS "orderId", MIN(e."createdAt") AS "at" FROM "OrderEvent" e JOIN "Order" o ON o."id" = e."orderId" WHERE e."field" = 'orderStatus' AND e."toValue" IN (${Prisma.join(statuses)}) AND e."createdAt" >= ${since} ${merchantId === null ? Prisma.empty : Prisma.sql`AND o."merchantId" = ${merchantId}`} GROUP BY o."id"`,
  );
}
