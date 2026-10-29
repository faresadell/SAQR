import "server-only";
import { db } from "@/lib/db";
import { pickEffective } from "@/lib/effective";
import {
  SETTING_DEFINITIONS,
  validateSettingValue,
  type IntSettingDefinition,
  type SettingKey,
  type SettingValue,
} from "@/lib/settings-registry";

interface CachedVersion {
  effectiveFrom: Date;
  createdAt: Date;
  value: number | null;
}

const CACHE_MS = 30_000;
const cache = new Map<string, { versions: CachedVersion[]; expiresAt: number }>();

async function loadVersions(key: SettingKey, definition: IntSettingDefinition): Promise<CachedVersion[]> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.versions;

  const rows = await db.platformSettingVersion.findMany({
    where: { key },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  // A stored value that fails validation is ignored, so a bad row can never weaken a setting.
  const versions = rows.flatMap((row) => {
    const value = (row.value as { v?: unknown } | null)?.v ?? null;
    return validateSettingValue(definition, value) ? [{ effectiveFrom: row.effectiveFrom, createdAt: row.createdAt, value }] : [];
  });
  cache.set(key, { versions, expiresAt: Date.now() + CACHE_MS });
  return versions;
}

/** The value in force at time `at`: newest version already effective, else the safe default. */
export async function getSettingAt<K extends SettingKey>(key: K, at: Date): Promise<SettingValue<K>> {
  const definition: IntSettingDefinition = SETTING_DEFINITIONS[key];
  const version = pickEffective(await loadVersions(key, definition), at);
  return (version ? version.value : definition.default) as SettingValue<K>;
}

export function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return getSettingAt(key, new Date());
}

/** Called after an admin saves. Other server instances pick the change up within CACHE_MS. */
export function invalidateSettingsCache(): void {
  cache.clear();
}
