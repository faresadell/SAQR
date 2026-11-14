import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { StartChatForm } from "@/features/chat/chat-ui";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "بدء محادثة" };

export default async function StartChatPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const { user } = await requireRole("CUSTOMER");
  const { shop: shopId = "" } = await searchParams;
  const shop = await db.merchant.findFirst({ where: { id: shopId.slice(0, 64), status: "APPROVED" }, select: { id: true, name: true } });
  if (!shop) return <EmptyState icon="message" title="هذا النشاط غير متاح للمحادثة" />;
  const existing = await db.conversation.findFirst({ where: { merchantId: shop.id, customerId: user.id }, select: { id: true } });
  return (
    <>
      <PageHeader title={`محادثة مع ${shop.name}`} description={existing ? "لديك محادثة سابقة مع هذا النشاط؛ رسالتك ستُضاف إليها." : undefined} />
      <div className="max-w-2xl">
        <StartChatForm merchantId={shop.id} />
      </div>
    </>
  );
}
