import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // First line of defense: only administrators see anything under /admin.
  // Every page and action below ALSO checks its own specific permission.
  const { user } = await requireRole("ADMIN");
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-4 bg-navy-900 px-5 py-3 text-white">
        <Link href="/admin" className="flex items-center gap-3 font-bold">
          <Logo size={36} />
          <span>لوحة التحكم</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-silver sm:inline">{user.name}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" className="text-white hover:bg-navy-800">خروج</Button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-5 py-6">{children}</div>
    </div>
  );
}
