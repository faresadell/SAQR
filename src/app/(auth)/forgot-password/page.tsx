import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "نسيت كلمة المرور" };

export default function ForgotPasswordPage() {
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">نسيت كلمة المرور</h1>
      <p className="text-sm text-ink-muted">اكتب رقم موبايلك أو بريدك الإلكتروني المؤكَّد وسنرسل لك رمزاً من 6 أرقام. حسابات المشرفين لا تستعيد كلمة المرور من هنا.</p>
      <ForgotForm />
      <Link href="/login" className="text-center text-sm font-semibold text-brand underline">العودة لتسجيل الدخول</Link>
    </Card>
  );
}
