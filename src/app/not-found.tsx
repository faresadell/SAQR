import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="text-ink-muted">الرابط غير صحيح أو تم نقل الصفحة.</p>
      <Link href="/" className="font-semibold text-brand underline">العودة للرئيسية</Link>
    </main>
  );
}
