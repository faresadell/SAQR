import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default function LoginPage() {
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">تسجيل الدخول</h1>
      <LoginForm />
      <p className="text-center text-sm text-ink-muted">
        ليس لديك حساب؟ <Link href="/register" className="font-semibold text-brand underline">إنشاء حساب</Link>
      </p>
    </Card>
  );
}
