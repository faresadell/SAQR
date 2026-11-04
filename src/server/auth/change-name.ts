import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/permissions";

export type ChangeNameResult = { ok: true; name: string } | { ok: false; error: "INVALID_NAME" | "SAME_NAME" };

/** Display name: 2-60 characters, no control characters, runs of spaces collapsed. */
export function cleanDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return null;
  for (const ch of name) if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127) return null;
  return name;
}

/** A signed-in user renames their own account (the name shown to shops and drivers). Audited with before/after. */
export async function changeName(actor: Actor, rawName: string): Promise<ChangeNameResult> {
  const name = cleanDisplayName(rawName);
  if (!name) return { ok: false, error: "INVALID_NAME" };
  const me = await db.user.findUnique({ where: { id: actor.id }, select: { name: true } });
  if (!me) return { ok: false, error: "INVALID_NAME" };
  if (me.name === name) return { ok: false, error: "SAME_NAME" };
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { name } });
    await writeAudit({ actorId: actor.id, action: "NAME_CHANGED", entityType: "User", entityId: actor.id, before: { name: me.name }, after: { name } }, tx);
  });
  return { ok: true, name };
}
