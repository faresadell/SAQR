// Resend (https://resend.com) sender for transactional email. Pure: fetch is injected, nothing here claims delivery,
// it only reports whether Resend accepted the request. Secrets come from environment variables, never from code.
export type EmailPurpose = "VERIFY_EMAIL" | "PASSWORD_RESET";

export interface ResendConfig {
  apiKey: string;
  from: string;
  templateIds?: Partial<Record<EmailPurpose, string>>;
  timeoutMs?: number;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

export const EMAIL_CODE_MINUTES = 10;
const APP_NAME = "صقر";

const SUBJECT: Record<EmailPurpose, string> = {
  VERIFY_EMAIL: "رمز تأكيد بريدك الإلكتروني في صقر",
  PASSWORD_RESET: "رمز استعادة كلمة المرور في صقر",
};
const LEAD: Record<EmailPurpose, string> = {
  VERIFY_EMAIL: "استخدم الرمز التالي لتأكيد بريدك الإلكتروني",
  PASSWORD_RESET: "استخدم الرمز التالي لاستعادة كلمة المرور",
};

export function emailBodies(purpose: EmailPurpose, code: string): { subject: string; html: string; text: string } {
  const lead = LEAD[purpose];
  return {
    subject: SUBJECT[purpose],
    text: `${lead}: ${code}\nصالح لمدة ${EMAIL_CODE_MINUTES} دقائق. لا تشاركه مع أحد. إذا لم تطلبه تجاهل هذه الرسالة.`,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8"><p>${lead}:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p><p>صالح لمدة ${EMAIL_CODE_MINUTES} دقائق. لا تشاركه مع أحد. إذا لم تطلبه تجاهل هذه الرسالة.</p></div>`,
  };
}

export async function sendCodeEmail(config: ResendConfig, to: string, purpose: EmailPurpose, code: string, fetchFn: FetchLike): Promise<void> {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to) || !/^\d{6}$/.test(code)) throw new Error("Invalid email arguments");
  const bodies = emailBodies(purpose, code);
  const templateId = config.templateIds?.[purpose];
  const payload = templateId
    ? { from: config.from, to: [to], subject: bodies.subject, template: { id: templateId, variables: { code, minutes: EMAIL_CODE_MINUTES, app_name: APP_NAME } } }
    : { from: config.from, to: [to], subject: bodies.subject, html: bodies.html, text: bodies.text };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 8000);
  try {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Email provider answered ${response.status}`); // never include the code or key in errors
  } finally {
    clearTimeout(timer);
  }
}
