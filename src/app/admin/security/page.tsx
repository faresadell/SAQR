import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SecurityPanel } from "@/features/admin/security-panel";
import { countUnusedRecoveryCodes } from "@/server/auth/admin-recovery";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الأمان" };

export default async function Page() {
  const { user } = await requireRole("ADMIN");
  const unused = await countUnusedRecoveryCodes(user);
  return (
    <>
      <PageHeader title="أمان حساب المشرف" description="رموز الاسترداد لتسجيل الدخول عند فقد جهاز المصادقة." />
      <SecurityPanel unused={unused} />
    </>
  );
}
