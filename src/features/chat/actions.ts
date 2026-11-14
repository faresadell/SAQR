"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/auth/guards";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { sendMessage, startConversation, type ChatError } from "@/server/chat/service";
import { DENIED_ERROR, GENERIC_ERROR, NOT_FOUND_ERROR } from "@/features/shared/messages";

const MESSAGES: Record<ChatError, string> = {
  INVALID_MESSAGE: "اكتب رسالة من 1 إلى 1000 حرف.",
  RATE_LIMITED: "أرسلت رسائل كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
  SHOP_UNAVAILABLE: "هذا النشاط غير متاح للمحادثة الآن.",
};

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function failure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: DENIED_ERROR };
  if (error instanceof NotFoundError) return { error: NOT_FOUND_ERROR };
  console.error(error);
  return { error: GENERIC_ERROR };
}

export async function startChatAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER");
  let id: string;
  try {
    const r = await startConversation(user, { merchantId: text(formData, "merchantId"), body: text(formData, "body") });
    if (!r.ok) return { error: MESSAGES[r.error] };
    id = r.conversationId;
  } catch (e) {
    return failure(e);
  }
  redirect(`/account/chats/${id}`);
}

export async function sendMessageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("CUSTOMER", "MERCHANT");
  const id = text(formData, "conversationId");
  try {
    const r = await sendMessage(user, id, text(formData, "body"));
    if (!r.ok) return { error: MESSAGES[r.error] };
  } catch (e) {
    return failure(e);
  }
  revalidatePath(user.role === "CUSTOMER" ? `/account/chats/${id}` : `/merchant/chats/${id}`);
  return { message: "sent" };
}
