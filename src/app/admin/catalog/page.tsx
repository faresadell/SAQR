import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/guards";
import { listBusinessTypes, listCategoryTree } from "@/server/catalog/categories";
import { archiveCategoryAction, setBusinessTypeActiveAction, setCategoryActiveAction } from "./actions";
import { CreateBusinessTypeForm, CreateCategoryForm, EditCategoryForm } from "./catalog-forms";

export const metadata: Metadata = { title: "التصنيفات وأنواع النشاط" };

const notices: Record<string, string> = {
  done: "تم تنفيذ العملية وتسجيلها في سجل المراجعة.",
  invalid: "البيانات غير صالحة.",
  children: "لا يمكن أرشفة تصنيف له تصنيفات فرعية فعّالة. أرشف الفرعية أولاً.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  missing: "العنصر غير موجود.",
};

function ToggleActive({ id, isActive }: { id: string; isActive: boolean }) {
  return (
    <form action={setCategoryActiveAction}>
      <input type="hidden" name="categoryId" value={id} />
      <input type="hidden" name="active" value={isActive ? "false" : "true"} />
      <Button type="submit" size="sm" variant="ghost">{isActive ? "إخفاء" : "إظهار"}</Button>
    </form>
  );
}

function Archive({ id }: { id: string }) {
  return (
    <form action={archiveCategoryAction}>
      <input type="hidden" name="categoryId" value={id} />
      <Button type="submit" size="sm" variant="ghost">أرشفة</Button>
    </form>
  );
}

export default async function AdminCatalogPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { user } = await requirePermission("catalog.manage");
  const { notice } = await searchParams;
  const [tree, types] = await Promise.all([listCategoryTree(user), listBusinessTypes()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">التصنيفات وأنواع النشاط</h1>
      {notice && notices[notice] ? <p role="status" className="rounded-control bg-brand-soft p-3 text-sm font-medium">{notices[notice]}</p> : null}

      <Card className="flex flex-col gap-4" id="categories">
        <h2 className="text-lg font-bold">التصنيفات</h2>
        <p className="text-sm text-ink-muted">مستويان فقط: تصنيف وتصنيفات فرعية. الأرشفة بدل الحذف حتى لا تتأثر الطلبات القديمة، وإخفاء التصنيف يخفي منتجاته عن العملاء.</p>
        <div className="flex flex-col gap-3">
          {tree.map((root) => (
            <div key={root.id} className="flex flex-col gap-3 rounded-control border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{root.nameAr}</span>
                  <Badge tone={root.isActive ? "success" : "neutral"}>{root.isActive ? "ظاهر" : "مخفي"}</Badge>
                </div>
                <div className="flex gap-1"><ToggleActive id={root.id} isActive={root.isActive} /><Archive id={root.id} /></div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-brand">تعديل</summary>
                <div className="mt-3"><EditCategoryForm id={root.id} nameAr={root.nameAr} nameEn={root.nameEn ?? ""} sortOrder={root.sortOrder} /></div>
              </details>

              {root.children.map((child) => (
                <div key={child.id} className="ms-4 flex flex-col gap-2 rounded-control bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span>{child.nameAr}</span>
                      <Badge tone={child.isActive ? "success" : "neutral"}>{child.isActive ? "ظاهر" : "مخفي"}</Badge>
                    </div>
                    <div className="flex gap-1"><ToggleActive id={child.id} isActive={child.isActive} /><Archive id={child.id} /></div>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-brand">تعديل</summary>
                    <div className="mt-3"><EditCategoryForm id={child.id} nameAr={child.nameAr} nameEn={child.nameEn ?? ""} sortOrder={child.sortOrder} /></div>
                  </details>
                </div>
              ))}

              <details>
                <summary className="cursor-pointer text-sm font-semibold text-brand">إضافة تصنيف فرعي</summary>
                <div className="mt-3"><CreateCategoryForm parentId={root.id} /></div>
              </details>
            </div>
          ))}
          {tree.length === 0 ? <p className="text-ink-muted">لا توجد تصنيفات بعد.</p> : null}
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand">إضافة تصنيف رئيسي</summary>
          <div className="mt-3"><CreateCategoryForm /></div>
        </details>
      </Card>

      <Card className="flex flex-col gap-4" id="types">
        <h2 className="text-lg font-bold">أنواع النشاط</h2>
        <div className="flex flex-col gap-2">
          {types.map((t) => (
            <div key={t.code} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{t.nameAr}</span>
                <span className="text-xs text-ink-muted" dir="ltr">{t.code}</span>
                <Badge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "متاح" : "مخفي"}</Badge>
              </div>
              <form action={setBusinessTypeActiveAction}>
                <input type="hidden" name="code" value={t.code} />
                <input type="hidden" name="active" value={t.isActive ? "false" : "true"} />
                <Button type="submit" size="sm" variant="ghost">{t.isActive ? "إخفاء" : "إظهار"}</Button>
              </form>
            </div>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand">إضافة نوع نشاط</summary>
          <div className="mt-3"><CreateBusinessTypeForm /></div>
        </details>
      </Card>
    </div>
  );
}
