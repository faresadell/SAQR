import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-navy-950 px-6 text-center">
      <Logo size={128} priority />
      <h1 className="text-4xl font-bold text-white">صقر</h1>
      <p className="max-w-sm text-lg text-silver">منصة التجارة المحلية والتوصيل في مصر</p>
      <Badge tone="info">قيد الإنشاء</Badge>
    </main>
  );
}
