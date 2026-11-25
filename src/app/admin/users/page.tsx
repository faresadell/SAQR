import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { normalizeEgyptPhone } from "@/lib/auth/phone";
import { requirePermission } from "@/server/auth/guards";
import { VEHICLE_LABELS, VEHICLE_TYPES } from "@/lib/vehicle";
import { adjustStarsAction, createCustomerAction, createDriverAction, createMerchantAction, deleteUserAction, setUserStatusAction } from "./actions";

export const metadata: Metadata = { title: "المستخدمون" };

const roleLabels = { CUSTOMER: "عميل", MERCHANT: "تاجر", DRIVER: "سائق", ADMIN: "مشرف" } as const;
const statusLabels = { PENDING: "بانتظار التأكيد", ACTIVE: "نشط", SUSPENDED: "موقوف" } as const;
const statusTones = { PENDING: "warning", ACTIVE: "success", SUSPENDED: "danger" } as const;
const notices: Record<string, string> = {
  done: "تم تنفيذ العملية وتسجيلها.",
  invalid: "البيانات غير مكتملة. اكتب سبباً واضحاً.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  missing: "المستخدم غير موجود.",
  driver_created: "تم فتح حساب السائق. سلّمه الإيميل وكلمة المرور المؤقتة، وانصحه بتغييرها من «أمان حسابي».",
  driver_name: "اكتب اسم السائق (حرفان على الأقل).",
  driver_vehicle: "اختر نوع مركبة السائق.",
  driver_phone: "رقم الموبايل غير صحيح (مثال: 01012345678).",
  driver_email: "الإيميل غير صحيح.",
  driver_password: "كلمة المرور ضعيفة: 8 أحرف على الأقل، وتجمع حروفاً مع أرقام أو رموز.",
  driver_phone_taken: "رقم الموبايل ده مسجّل قبل كده.",
  driver_email_taken: "الإيميل ده مسجّل قبل كده.",
  merchant_created: "تم فتح حساب التاجر ونشاطه. سلّمه الإيميل وكلمة المرور المؤقتة. النشاط يحتاج باقة نجوم وحساب دفع ليستقبل طلبات.",
  customer_created: "تم فتح حساب العميل. سلّمه الإيميل وكلمة المرور المؤقتة.",
  merchant_shop: "اكتب اسم النشاط (حرفان على الأقل).",
  merchant_type: "اختر نوع النشاط.",
  deleted: "تم حذف الحساب نهائيًا وتسجيل ذلك.",
  anonymized: "الحساب عليه طلبات أو نجوم، فتم إغلاقه وإخفاء بياناته بدل المسح الكامل. لا يمكنه الدخول والرقم والإيميل أصبحا متاحين للتسجيل من جديد.",
  stars_done: "تم تعديل رصيد النجوم وتسجيله.",
  stars_invalid: "اكتب عدد نجوم صحيح (موجب للإضافة، سالب للخصم) وسببًا واضحًا.",
  stars_below_zero: "الخصم أكبر من رصيد الحساب.",
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
    select: { id: true, name: true, phone: true, role: true, status: true, isSuperAdmin: true, starAccount: { select: { balance: true } } },
  });
  const businessTypes = canManage ? await db.businessType.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" }, select: { code: true, nameAr: true } }) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">المستخدمون</h1>
      {notice && notices[notice] ? <p role="status" className="rounded-control bg-brand-soft p-3 text-sm font-medium">{notices[notice]}</p> : null}

      {canManage ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">إضافة سائق</h2>
          <p className="text-sm text-ink-muted">السائق لا يسجّل بنفسه. اكتب بياناته وكلمة مرور مؤقتة، وسلّمها له ليدخل بالإيميل.</p>
          <form action={createDriverAction} className="grid gap-2 sm:grid-cols-2">
            <input name="name" required minLength={2} maxLength={80} placeholder="اسم السائق" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <select name="vehicleType" required defaultValue="MOTORCYCLE" aria-label="نوع المركبة" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3">
              {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{VEHICLE_LABELS[v]}</option>)}
            </select>
            <input name="phone" required inputMode="tel" dir="ltr" placeholder="رقم الموبايل 01XXXXXXXXX" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="email" type="email" required dir="ltr" placeholder="الإيميل" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="password" type="text" required minLength={8} dir="ltr" placeholder="كلمة مرور مؤقتة" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <Button type="submit" className="sm:col-span-2">فتح حساب سائق</Button>
          </form>
        </Card>
      ) : null}

      {canManage ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">إضافة تاجر</h2>
          <p className="text-sm text-ink-muted">يُفتح حساب التاجر ونشاطه معتمدًا مباشرة. بعدها اشترِ له باقة أو أضف له نجومًا ليبدأ.</p>
          <form action={createMerchantAction} className="grid gap-2 sm:grid-cols-2">
            <input name="name" required minLength=2 maxLength=80 placeholder="اسم صاحب النشاط" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="shopName" required minLength=2 maxLength=80 placeholder="اسم النشاط" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <select name="businessType" required aria-label="نوع النشاط" defaultValue="" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3">
              <option value="" disabled>نوع النشاط</option>
              {businessTypes.map((t) => <option key={t.code} value={t.code}>{t.nameAr}</option>)}
            </select>
            <input name="phone" required inputMode="tel" dir="ltr" placeholder="رقم الموبايل 01XXXXXXXXX" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="email" type="email" required dir="ltr" placeholder="الإيميل" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="password" type="text" required minLength=8 dir="ltr" placeholder="كلمة مرور مؤقتة" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <Button type="submit" className="sm:col-span-2">فتح حساب تاجر</Button>
          </form>
        </Card>
      ) : null}

      {canManage ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">إضافة عميل</h2>
          <form action={createCustomerAction} className="grid gap-2 sm:grid-cols-2">
            <input name="name" required minLength=2 maxLength=80 placeholder="اسم العميل" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="phone" required inputMode="tel" dir="ltr" placeholder="رقم الموبايل 01XXXXXXXXX" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="email" type="email" required dir="ltr" placeholder="الإيميل" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <input name="password" type="text" required minLength=8 dir="ltr" placeholder="كلمة مرور مؤقتة" autoComplete="off" className="h-11 min-w-0 rounded-control border border-line bg-surface px-3" />
            <Button type="submit" className="sm:col-span-2">فتح حساب عميل</Button>
          </form>
        </Card>
      ) : null}

      <form className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="ابحث بالاسم أو رقم الموبايل" className="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3" />
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
                {u.role !== "ADMIN" ? <Badge>{u.starAccount?.balance ?? 0} ★</Badge> : null}
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
            {canManage && u.role !== "ADMIN" ? (
              <form action={adjustStarsAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <input name="amount" type="number" required step={1} dir="ltr" placeholder="نجوم (+ إضافة / − خصم)" aria-label="عدد النجوم" className="h-10 w-40 rounded-control border border-line bg-surface px-3 text-sm" />
                <input name="note" required minLength={3} maxLength={200} placeholder="السبب" className="h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm" />
                <Button type="submit" size="sm" variant="secondary">تعديل النجوم</Button>
              </form>
            ) : null}
            {canManage && !u.isSuperAdmin && u.id !== actor.user.id && u.phone.startsWith("deleted-") === false ? (
              <form action={deleteUserAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <input name="reason" required minLength={3} maxLength={300} placeholder="سبب الحذف" className="h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm" />
                <Button type="submit" size="sm" variant="danger">حذف الحساب</Button>
              </form>
            ) : null}
          </Card>
        ))}
        {users.length === 0 ? <p className="text-ink-muted">لا توجد نتائج.</p> : null}
      </div>
    </div>
  );
}
