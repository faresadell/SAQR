import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { parseEffectiveFrom } from "@/lib/effective";
import { getSettingAt, invalidateSettingsCache } from "@/lib/settings";
import {
  SETTING_DEFINITIONS,
  parseSettingInput,
  settingKeysInGroup,
  type SettingGroup,
  type SettingKey,
} from "@/lib/settings-registry";
import { AuthorizationError } from "@/server/errors";

export type ChangeResult = { ok: true; effectiveFrom: Date } | { ok: false; error: "UNKNOWN_KEY" | "INVALID_VALUE" | "INVALID_DATE" | "IN_PAST" | "TOO_FAR" };

export function assertCanManageSettings(actor: Actor): void {
  if (!hasPermission(actor, "settings.manage")) throw new AuthorizationError();
}

/**
 * Save a new version of a setting. History is never edited: the change is a new row that takes
 * effect at `effectiveFromRaw` (default now, never in the past). The audit entry is written in
 * the same transaction, with the old value, new value, actor and effective date.
 */
export async function changeSetting(actor: Actor, key: string, rawValue: string, effectiveFromRaw?: string | null): Promise<ChangeResult> {
  assertCanManageSettings(actor);

  const parsed = parseSettingInput(key, rawValue);
  if (!parsed.ok) return parsed;
  const now = new Date();
  const when = parseEffectiveFrom(effectiveFromRaw, now);
  if (!when.ok) return when;

  const before = await getSettingAt(parsed.key, now);
  await db.$transaction(async (tx) => {
    await tx.platformSettingVersion.create({
      data: { key: parsed.key, value: { v: parsed.value }, effectiveFrom: when.date, createdById: actor.id },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: "SETTING_CHANGED",
        entityType: "PlatformSetting",
        entityId: parsed.key,
        before: { value: before },
        after: { value: parsed.value, effectiveFrom: when.date.toISOString() },
      },
      tx,
    );
  });
  invalidateSettingsCache();
  return { ok: true, effectiveFrom: when.date };
}

export interface SettingState {
  key: SettingKey;
  label: string;
  help?: string;
  unit: string;
  min: number;
  max: number;
  nullable: boolean;
  current: number | null;
  scheduled: { value: number | null; effectiveFrom: Date }[];
}

export async function listSettingStates(actor: Actor, group: SettingGroup): Promise<SettingState[]> {
  if (!hasPermission(actor, "settings.view") && !hasPermission(actor, "settings.manage")) throw new AuthorizationError();
  const now = new Date();
  const keys = settingKeysInGroup(group);
  const upcoming = await db.platformSettingVersion.findMany({
    where: { key: { in: keys }, effectiveFrom: { gt: now } },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "desc" }],
  });

  return Promise.all(
    keys.map(async (key) => {
      const definition = SETTING_DEFINITIONS[key];
      const seen = new Set<number>();
      const scheduled = upcoming
        .filter((row) => row.key === key)
        .filter((row) => (seen.has(row.effectiveFrom.getTime()) ? false : (seen.add(row.effectiveFrom.getTime()), true)))
        .map((row) => ({ value: ((row.value as { v?: number | null }).v ?? null), effectiveFrom: row.effectiveFrom }));
      return {
        key,
        label: definition.label,
        ...("help" in definition ? { help: definition.help } : {}),
        unit: definition.unit,
        min: definition.min,
        max: definition.max,
        nullable: "nullable" in definition,
        current: (await getSettingAt(key, now)) as number | null,
        scheduled,
      };
    }),
  );
}
