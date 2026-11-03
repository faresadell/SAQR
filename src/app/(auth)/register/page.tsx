import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default async function RegisterPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // reading request headers makes the page dynamic: the environment is read per request, never at build time
  const env = getEnv();
  const siteKey = env.CAPTCHA_PROVIDER === "turnstile" ? (env.TURNSTILE_SITE_KEY ?? null) : null;
  return (
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">إنشاء حساب جديد</h1>
      <RegisterForm siteKey={siteKey} nonce={nonce} />
      <p className="text-center text-sm text-ink-muted">
        لديك حساب بالفعل؟ <Link href="/login" className="font-semibold text-brand underline">تسجيل الدخول</Link>
      </p>
    </Card>
  );
}
