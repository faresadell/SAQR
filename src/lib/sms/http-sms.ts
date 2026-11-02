// Generic HTTP SMS sender for OTP codes. Provider-neutral on purpose: it POSTs JSON {to, message, sender} with a bearer token.
// A real provider (Vonage, Twilio, a local Egyptian gateway...) usually needs its own body/headers: write an adapter that
// implements the same function and select it with OTP_PROVIDER. Nothing here claims delivery: it only reports HTTP success.
export interface HttpSmsConfig {
  url: string;
  token: string;
  sender?: string;
  timeoutMs?: number;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

const PURPOSE_TEXT: Record<string, string> = {
  SIGNUP: "رمز تفعيل حسابك في صقر",
  LOGIN: "رمز دخولك إلى صقر",
  PASSWORD_RESET: "رمز استعادة كلمة المرور في صقر",
};

export function otpMessage(purpose: string, code: string): string {
  return `${PURPOSE_TEXT[purpose] ?? "رمز التحقق في صقر"}: ${code}. لا تشاركه مع أحد.`;
}

export async function sendOtpViaHttp(config: HttpSmsConfig, phone: string, purpose: string, code: string, fetchFn: FetchLike): Promise<void> {
  if (!/^\+?\d{8,15}$/.test(phone) || !/^\d{6}$/.test(code)) throw new Error("Invalid SMS arguments");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);
  try {
    const response = await fetchFn(config.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ to: phone, message: otpMessage(purpose, code), ...(config.sender ? { sender: config.sender } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`SMS gateway answered ${response.status}`); // never include the code or token in errors
  } finally {
    clearTimeout(timer);
  }
}
