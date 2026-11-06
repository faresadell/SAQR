import "server-only";
import { db } from "@/lib/db";
import { parseAvatarDataUrl } from "@/lib/avatar-data";

export type SetAvatarResult = { ok: true } | { ok: false; error: "INVALID_IMAGE" };

/** A signed-in user sets their own picture from a client-resized JPEG data URL. Anything else is refused. */
export async function setAvatar(userId: string, dataUrl: string): Promise<SetAvatarResult> {
  const bytes = parseAvatarDataUrl(dataUrl);
  if (!bytes) return { ok: false, error: "INVALID_IMAGE" };
  const data = Buffer.from(bytes);
  await db.userAvatar.upsert({ where: { userId }, create: { userId, bytes: data }, update: { bytes: data } });
  return { ok: true };
}

export async function clearAvatar(userId: string): Promise<void> {
  await db.userAvatar.deleteMany({ where: { userId } });
}

export async function readAvatar(userId: string): Promise<Uint8Array | null> {
  const row = await db.userAvatar.findUnique({ where: { userId } });
  return row ? new Uint8Array(row.bytes) : null;
}

/** When the picture last changed (used to bust the browser cache), or null when the user has none. */
export async function avatarVersion(userId: string): Promise<number | null> {
  const row = await db.userAvatar.findUnique({ where: { userId }, select: { updatedAt: true } });
  return row ? row.updatedAt.getTime() : null;
}
