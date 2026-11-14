import type { Metadata } from "next";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/ui/page-header";
import { ChatList } from "@/features/chat/chat-list";
import { requireRole } from "@/server/auth/guards";
import { listConversations } from "@/server/chat/service";

export const metadata: Metadata = { title: "المحادثات" };

export default async function MerchantChatsPage() {
  const { user } = await requireRole("MERCHANT");
  const rows = await listConversations(user);
  return (
    <>
      <AutoRefresh />
      <PageHeader title="المحادثات" description="رسائل العملاء. لا يطّلع عليها غيرك وغير العميل." />
      <ChatList rows={rows} base="/merchant/chats" />
    </>
  );
}
