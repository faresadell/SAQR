import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">تسجيل الدخول</h1>
      {reset === "1" ? <Notice tone="success">تم تغيير كلمة المرور. سجّل الدخول بالجديدة.</Notice> : null}
      <LoginForm />
      <p className="text-center text-sm text-ink-muted">
        ليس لديك حساب؟ <Link href="/register" className="font-semibold text-brand underline">إنشاء حساب</Link>
      </p>
    </Card>
  );
}
