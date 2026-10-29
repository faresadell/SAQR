import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-3">
        <Logo size={72} priority />
        <span className="text-2xl font-bold text-navy-900">صقر</span>
      </div>
      {children}
    </main>
  );
}
