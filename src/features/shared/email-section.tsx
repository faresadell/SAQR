import { db } from "@/lib/db";
import { EmailPanel } from "./email-panel";

/** Server wrapper: reads the signed-in user's own email state. */
export async function EmailSection({ userId }: { userId: string }) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  return <EmailPanel email={me?.email ?? null} verified={!!me?.emailVerifiedAt} />;
}
