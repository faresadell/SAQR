import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/link-button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={64} />
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="text-ink-muted">الرابط غير صحيح أو تم نقل الصفحة.</p>
      <LinkButton href="/">العودة للرئيسية</LinkButton>
    </main>
  );
}
