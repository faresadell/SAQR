import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "تعيين كلمة مرور جديدة" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const identifier = typeof id === "string" ? id.slice(0, 254) : "";
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">تعيين كلمة مرور جديدة</h1>
      <p className="text-sm text-ink-muted">إذا كان الحساب موجوداً ومؤهلاً فقد أُرسل إليه رمز. اكتب الرمز وكلمة المرور الجديدة. سيُسجَّل خروجك من كل الأجهزة.</p>
      <ResetForm identifier={identifier} />
      <Link href="/forgot-password" className="text-center text-sm font-semibold text-brand underline">إعادة إرسال الرمز</Link>
    </Card>
  );
}
