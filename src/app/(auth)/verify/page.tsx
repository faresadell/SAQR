import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getPendingPhone } from "@/server/auth/session";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "تأكيد رقم الموبايل" };

export default async function VerifyPage() {
  if (!(await getPendingPhone())) redirect("/register");
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">تأكيد رقم الموبايل</h1>
      <p className="text-ink-muted">اكتب الرمز المكوّن من 6 أرقام الذي أرسلناه لرقمك.</p>
      <VerifyForm />
    </Card>
  );
}
