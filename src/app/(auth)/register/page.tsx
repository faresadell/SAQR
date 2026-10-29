import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default function RegisterPage() {
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">إنشاء حساب جديد</h1>
      <RegisterForm />
      <p className="text-center text-sm text-ink-muted">
        لديك حساب بالفعل؟ <Link href="/login" className="font-semibold text-brand underline">تسجيل الدخول</Link>
      </p>
    </Card>
  );
}
