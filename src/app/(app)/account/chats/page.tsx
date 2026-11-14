import type { Metadata } from "next";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/ui/page-header";
import { ChatList } from "@/features/chat/chat-list";
import { requireRole } from "@/server/auth/guards";
import { listConversations } from "@/server/chat/service";

export const metadata: Metadata = { title: "المحادثات" };

export default async function CustomerChatsPage() {
  const { user } = await requireRole("CUSTOMER");
  const rows = await listConversations(user);
  return (
    <>
      <AutoRefresh />
      <PageHeader title="المحادثات" description="محادثاتك مع الأنشطة. لا يطّلع عليها غيرك وغير النشاط." />
      <ChatList rows={rows} base="/account/chats" />
    </>
  );
}
