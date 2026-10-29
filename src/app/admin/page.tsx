import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { hasPermission } from "@/lib/auth/permissions";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "لوحة التحكم" };

export default async function AdminHomePage() {
  const { user } = await requireRole("ADMIN");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">أهلاً {user.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {hasPermission(user, "users.view") ? (
          <Link href="/admin/users">
            <Card className="font-semibold hover:border-brand">إدارة المستخدمين</Card>
          </Link>
        ) : null}
        {hasPermission(user, "merchants.review") ? (
          <Link href="/admin/merchants">
            <Card className="font-semibold hover:border-brand">التجار</Card>
          </Link>
        ) : null}
        {hasPermission(user, "catalog.manage") ? (
          <Link href="/admin/catalog">
            <Card className="font-semibold hover:border-brand">التصنيفات وأنواع النشاط</Card>
          </Link>
        ) : null}
        {hasPermission(user, "settings.view") || hasPermission(user, "settings.manage") ? (
          <Link href="/admin/settings">
            <Card className="font-semibold hover:border-brand">إعدادات المنصة</Card>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
