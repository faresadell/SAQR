import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";
import { formatEgp } from "@/lib/money";

export interface AwardView {
  monthKey: string;
  rank: number;
  prizeCents: number;
  status: string;
  paidAt: string | null;
}

/** The customer's own approved or paid contest wins. Nothing is shown for proposed or rejected awards. */
export function AwardsList({ awards }: { awards: AwardView[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">جوائز المسابقة الشهرية</h2>
      {awards.length === 0 ? (
        <p className="text-sm text-ink-muted">لا توجد جوائز بعد. تظهر هنا الجوائز المعتمدة عند فوزك في المسابقة، متى فُعّلت.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {awards.map((a) => (
            <li key={`${a.monthKey}:${a.rank}`}>
              <Card className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">المركز <span className="num">{formatNumber(a.rank)}</span> — <span className="num">{a.monthKey}</span></span>
                  <Badge tone={a.status === "PAID" ? "success" : "info"}>{a.status === "PAID" ? "تم الصرف" : "معتمدة"}</Badge>
                </div>
                <p className="text-sm">قيمة الجائزة: <strong className="num">{formatEgp(a.prizeCents)}</strong></p>
                {a.paidAt ? <p className="text-xs text-ink-muted">صُرفت في <span className="num">{formatDate(a.paidAt)}</span></p> : <p className="text-xs text-ink-muted">سيتواصل معك فريقنا لتسليم الجائزة.</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
