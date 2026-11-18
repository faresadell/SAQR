import { Card } from "@/components/ui/card";
import { RequestDetail } from "@/features/requests/request-views";
import { NewRequestForm } from "@/features/requests/requests-ui";
import { listMyAddresses } from "@/server/addresses/service";
import type { Actor } from "@/lib/auth/permissions";
import { getOrderRequest } from "@/server/orders/requests";
import Link from "next/link";

/** Orders inside the chat: the customer writes the order here, the shop answers with ONE final price, the customer agrees and lands on the payment page. */
export async function ChatRequests({ actor, chat, merchantId }: { actor: Actor; chat: { id: string; side: "customer" | "merchant"; requestIds: string[] }; merchantId: string | null }) {
  const requests = (await Promise.all(chat.requestIds.map((id) => getOrderRequest(actor, id).catch(() => null)))).filter((r) => r !== null);
  const customer = chat.side === "customer";
  const addresses = customer ? await listMyAddresses(actor) : [];
  const open = requests.some((r) => r.status === "PENDING_QUOTE" || r.status === "QUOTED");
  return (
    <section className="flex flex-col gap-3" aria-label="الطلبات في هذه المحادثة">
      <h2 className="text-lg font-bold">الطلبات</h2>
      {requests.map((r) => <RequestDetail key={r.id} request={r} />)}
      {requests.length === 0 && !customer ? <p className="text-sm text-ink-muted">لا توجد طلبات من هذا العميل بعد. عندما يكتب طلبه هنا سيظهر لك مكان كتابة السعر.</p> : null}
      {customer && merchantId && !open ? (
        <Card className="flex flex-col gap-3">
          <h3 className="font-bold">اطلب من هنا</h3>
          {addresses.length === 0 ? (
            <p className="text-sm text-ink-muted">أضف عنوان توصيل أولاً من <Link href="/account/addresses" className="font-bold text-brand underline">عناويني</Link> ثم ارجع هنا.</p>
          ) : (
            <NewRequestForm merchantId={merchantId} addresses={addresses.map((a) => ({ id: a.id, label: a.label, line: a.line }))} chatId={chat.id} />
          )}
        </Card>
      ) : null}
    </section>
  );
}
