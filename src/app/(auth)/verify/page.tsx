import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getPendingPhone } from "@/server/auth/session";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "تفعيل الحساب" };

export default async function VerifyPage() {
  if (!(await getPendingPhone())) redirect("/register");
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">تفعيل الحساب</h1>
      <p className="text-ink-muted">اكتب الرمز المكوّن من 6 أرقام الذي أرسلناه إلى بريدك الإلكتروني (راجع البريد غير المرغوب أيضاً).</p>
      <VerifyForm />
    </Card>
  );
}
