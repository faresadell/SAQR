import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";

export interface ConversationRow { id: string; title: string; lastBody: string; lastMessageAt: string; unread: boolean }

export function ChatList({ rows, base }: { rows: ConversationRow[]; base: string }) {
  if (rows.length === 0) return <EmptyState icon="message" title="لا توجد محادثات بعد">ستظهر هنا محادثاتك مع الأنشطة والعملاء.</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`${base}/${r.id}`} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 hover:border-line-strong">
            <span className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">{r.title}</span>
              {r.unread ? <Badge tone="info">جديد</Badge> : null}
            </span>
            <span className="line-clamp-1 text-sm text-ink-muted">{r.lastBody}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
