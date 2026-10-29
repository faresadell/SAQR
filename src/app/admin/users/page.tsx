import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { requirePermission } from "@/server/auth/guards";
import { setUserStatusAction } from "./actions";

export const metadata: Metadata = { title: "المستخدمون" };

const roleLabels = { CUSTOMER: "عميل", MERCHANT: "تاجر", DRIVER: "سائق", ADMIN: "مشرف" } as const;
const statusLabels = { PENDING: "بانتظار التأكيد", ACTIVE: "نشط", SUSPENDED: "موقوف" } as const;
const statusTones = { PENDING: "warning", ACTIVE: "success", SUSPENDED: "danger" } as const;
const notices: Record<string, string> = {
  done: "تم تنفيذ العملية وتسجيلها.",
  invalid: "البيانات غير مكتملة. اكتب سبباً واضحاً.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  missing: "المستخدم غير موجود.",
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; notice?: string }> }) {
  const actor = await requirePermission("users.view");
  const canManage = hasPermission(actor.user, "users.manage");
  const { q, notice } = await searchParams;

  const phone = q ? normalizeEgyptPhone(q) : null;
  const filters: Prisma.UserWhereInput[] = [{ name: { contains: (q ?? "").slice(0, 80), mode: "insensitive" } }];
  if (phone) filters.push({ phone });
  const users = await db.user.findMany({
    where: q ? { OR: filters } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, phone: true, role: true, status: true, isSuperAdmin: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">المستخدمون</h1>
      {notice && notices[notice] ? <p role="status" className="rounded-control bg-brand-soft p-3 text-sm font-medium">{notices[notice]}</p> : null}

      <form className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="ابحث بالاسم أو رقم الموبايل" className="h-11 flex-1 rounded-control border border-line bg-surface px-3" />
        <Button type="submit" variant="secondary">بحث</Button>
      </form>

      <div className="flex flex-col gap-3">
        {users.map((u) => (
          <Card key={u.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{u.name}</p>
                <p className="ltr-isolate text-start text-sm text-ink-muted">{u.phone}</p>
              </div>
              <div className="flex gap-2">
                <Badge>{roleLabels[u.role]}</Badge>
                <Badge tone={statusTones[u.status]}>{statusLabels[u.status]}</Badge>
              </div>
            </div>
            {canManage && !u.isSuperAdmin && u.id !== actor.user.id ? (
              <form action={setUserStatusAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="next" value={u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
                <input name="reason" required minLength={3} maxLength={300} placeholder="السبب (يُسجَّل في سجل المراجعة)" className="h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm" />
                <Button type="submit" size="sm" variant={u.status === "SUSPENDED" ? "primary" : "danger"}>
                  {u.status === "SUSPENDED" ? "إعادة التفعيل" : "إيقاف الحساب"}
                </Button>
              </form>
            ) : null}
          </Card>
        ))}
        {users.length === 0 ? <p className="text-ink-muted">لا توجد نتائج.</p> : null}
      </div>
    </div>
  );
}
