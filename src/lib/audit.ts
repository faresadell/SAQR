import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Append-only audit trail. Pass a transaction client to make the entry atomic with the change. */
export async function writeAudit(entry: AuditEntry, client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.before !== undefined ? { before: entry.before } : {}),
      ...(entry.after !== undefined ? { after: entry.after } : {}),
      ip: entry.ip && entry.ip !== "unknown" ? entry.ip : null,
    },
  });
}
