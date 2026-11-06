import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { readAvatar } from "@/server/auth/avatar";

/** GET /api/me/avatar — the signed-in user's own picture. Private: never served to anyone else. */
export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const bytes = await readAvatar(session.user.id);
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
