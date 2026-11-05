import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { isSetupOpen } from "@/server/auth/bootstrap-admin";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "إنشاء المدير الأول", robots: { index: false, follow: false } };

/** Exists only while SETUP_TOKEN is set and no administrator exists; otherwise it is a plain 404. */
export default async function SetupPage() {
  if (!(await isSetupOpen())) notFound();
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">إنشاء المدير الأول</h1>
      <p className="text-sm text-ink-muted">تُستخدم مرة واحدة. بعد الإنشاء تُغلق الصفحة تلقائياً. احذف المتغير SETUP_TOKEN من إعدادات الاستضافة بعدها.</p>
      <SetupForm />
    </Card>
  );
}
