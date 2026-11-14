import type { Metadata } from "next";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/ui/page-header";
import { MessageList, ReplyForm } from "@/features/chat/chat-ui";
import { requireRole } from "@/server/auth/guards";
import { openConversation } from "@/server/chat/service";

export const metadata: Metadata = { title: "محادثة" };

export default async function MerchantChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("MERCHANT");
  const { id } = await params;
  const chat = await openConversation(user, id.slice(0, 64)).catch(() => null);
  if (!chat) return <PageHeader title="المحادثة غير موجودة" />;
  return (
    <>
      <AutoRefresh />
      <PageHeader title={chat.title} description="تتحدّث مع العميل مباشرة. تُحدَّث الرسائل كل ثوانٍ قليلة." />
      <div className="flex max-w-2xl flex-col gap-4">
        <MessageList messages={chat.messages} />
        <ReplyForm conversationId={chat.id} />
      </div>
    </>
  );
}
