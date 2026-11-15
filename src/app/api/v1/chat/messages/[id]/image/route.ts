import { NextResponse, type NextRequest } from "next/server";
import { apiError, currentActor, mapThrown } from "@/server/api/http";
import { readChatImage } from "@/server/chat/service";

/** GET /api/v1/chat/messages/{id}/image — the picture in a chat message, only for the customer and the shop owner in that chat. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const actor = await currentActor();
    if (!actor) return apiError(401, "UNAUTHENTICATED");
    const { id } = await context.params;
    const { bytes, contentType } = await readChatImage(actor, id);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline; filename=photo",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return mapThrown(error);
  }
}
