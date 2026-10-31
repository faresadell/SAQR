import "server-only";
import { db } from "@/lib/db";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/server/errors";

export interface AuditFilter {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

/** Read-only view of the audit log (newest first, cursor paging). Needs audit.view. The log itself is append-only. */
export async function listAuditLog(actor: Actor, filter: AuditFilter = {}) {
  if (!hasPermission(actor, "audit.view")) throw new AuthorizationError();
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
  const rows = await db.auditLog.findMany({
    where: {
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.from || filter.to ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
