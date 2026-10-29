import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { logoutAction } from "@/app/(auth)/actions";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "حسابي" };

const roleLabels = { CUSTOMER: "عميل", MERCHANT: "تاجر", DRIVER: "سائق", ADMIN: "مشرف" } as const;

export default async function AccountPage() {
  const { user } = await requireUser();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-5 py-10">
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{user.name}</h1>
          <Badge tone="info">{roleLabels[user.role]}</Badge>
        </div>
        <p className="ltr-isolate text-start text-ink-muted">{user.phone}</p>
        {user.role === "MERCHANT" ? (
          <Link href="/merchant" className="font-semibold text-brand underline">لوحة التاجر</Link>
        ) : null}
        {user.role === "ADMIN" ? (
          <Link href="/admin" className="font-semibold text-brand underline">لوحة التحكم</Link>
        ) : null}
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" className="w-full">تسجيل الخروج</Button>
        </form>
      </Card>
    </main>
  );
}
