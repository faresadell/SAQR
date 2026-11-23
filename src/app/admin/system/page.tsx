import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCairo } from "@/lib/cairo-time";
import { requireRole } from "@/server/auth/guards";
import { systemCheck } from "@/server/platform/system-check";
import { sendTestEmailAction } from "./actions";

export const metadata: Metadata = { title: "فحص النظام" };
export const dynamic = "force-dynamic";

function mailNotice(code: string | undefined): { tone: "ok" | "bad"; text: string } | null {
  if (!code) return null;
  if (code === "sent") return { tone: "ok", text: "Resend قبل الرسالة. افحص صندوق الوارد (وSpam) لإيميل حسابك." };
  if (code === "notresend") return { tone: "bad", text: "إعداد الإيميل ليس resend أو ينقصه المفتاح/عنوان المرسل." };
  if (code === "noaddress") return { tone: "bad", text: "حساب الأدمن ليس له إيميل." };
  if (code.startsWith("failed:")) return { tone: "bad", text: `Resend رفض الإرسال: ${code.slice(7)}` };
  return null;
}

const outcomeLabel: Record<string, string> = {
  CREATED: "CREATED (account made, code sent)",
  RESENT_PENDING: "RESENT_PENDING (pending account, code re-sent)",
  EXISTING_EMAIL: "EXISTING_EMAIL (email already has an account, nothing sent)",
  EXISTING_PHONE: "EXISTING_PHONE (phone already has an account, nothing sent)",
  RACE: "RACE (parallel duplicate)",
};

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span dir="ltr" className={bad ? "font-medium text-danger" : "font-medium"}>{value}</span>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ mail?: string }> }) {
  await requireRole("ADMIN");
  const [c, sp] = await Promise.all([systemCheck(), searchParams]);
  const notice = mailNotice(sp.mail);
  const split = Boolean(c.migrateEndpoint && c.runtimeEndpoint && c.migrateEndpoint !== c.runtimeEndpoint);
  return (
    <>
      <PageHeader title="فحص النظام" description="الموقع الشغال متوصل بأنهي قاعدة بيانات، وهل الإيميل مضبوط. أسماء وأرقام فقط، بلا أي مفاتيح." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">قاعدة البيانات</h2>
          <Row label="الموقع يكتب على" value={c.runtimeEndpoint ?? "غير معروف"} />
          <Row label="التحديثات (migrations) تتم على" value={c.migrateEndpoint ?? "نفس الرابط"} bad={split} />
          <Row label="اسم القاعدة" value={c.database ?? "—"} />
          <Row label="عدد المستخدمين" value={String(c.users)} />
          <Row label="آخر مستخدم سُجّل" value={c.newestUserAt ? formatCairo(c.newestUserAt) : "لا يوجد"} />
          <Row label="آخر كود تفعيل أُصدر" value={c.newestCodeAt ? formatCairo(c.newestCodeAt) : "لا يوجد"} />
          <h3 className="mt-3 text-sm font-semibold">آخر محاولات التسجيل</h3>
          {c.registerAttempts.length === 0 ? <p className="text-sm text-ink-muted">لا توجد محاولات مسجّلة بعد.</p> : null}
          {c.registerAttempts.map((a, i) => (
            <p key={i} dir="ltr" className="text-xs text-ink-muted">{formatCairo(a.at)} · {outcomeLabel[a.outcome] ?? a.outcome}</p>
          ))}
          {split ? <p className="mt-2 text-sm text-danger">الرابطان يشيران إلى قاعدتين مختلفتين: الموقع يكتب في مكان غير الذي تُجرى عليه التحديثات.</p> : null}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">الإيميل</h2>
          <Row label="المزوّد" value={c.emailProvider} bad={c.emailProvider !== "resend"} />
          <Row label="مفتاح Resend" value={c.hasApiKey ? "موجود" : "ناقص"} bad={!c.hasApiKey} />
          <Row label="نطاق المرسل" value={c.fromDomain ?? "غير صالح"} bad={!c.fromDomain} />
          <Row label="APP_URL" value={c.appUrl} />
          <Row label="النسخة (commit)" value={c.deployment ?? "—"} />
          <Row label="إخفاقات الإرسال (7 أيام)" value={String(c.sendFailures7d)} bad={c.sendFailures7d > 0} />
          {c.lastFailures.map((f, i) => (
            <p key={i} dir="ltr" className="mt-1 text-xs text-ink-muted">{formatCairo(f.at)} · {f.reason}</p>
          ))}
          <form action={sendTestEmailAction} className="mt-4 flex items-center gap-3">
            <Button type="submit">أرسل إيميل تجربة لحسابي</Button>
            {notice ? <Badge tone={notice.tone === "ok" ? "success" : "danger"}>{notice.tone === "ok" ? "تم" : "فشل"}</Badge> : null}
          </form>
          {notice ? <p className="mt-2 text-sm">{notice.text}</p> : null}
        </Card>
      </div>
    </>
  );
}
