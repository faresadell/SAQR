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

async function postToResend(config: ResendConfig, payload: unknown, fetchFn: FetchLike): Promise<void> {
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

const looksLikeEmail = (to: string): boolean => to.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to);

export async function sendCodeEmail(config: ResendConfig, to: string, purpose: EmailPurpose, code: string, fetchFn: FetchLike): Promise<void> {
  if (!looksLikeEmail(to) || !/^\d{6}$/.test(code)) throw new Error("Invalid email arguments");
  const bodies = emailBodies(purpose, code);
  const templateId = config.templateIds?.[purpose];
  const payload = templateId
    ? { from: config.from, to: [to], subject: bodies.subject, template: { id: templateId, variables: { code, minutes: EMAIL_CODE_MINUTES, app_name: APP_NAME } } }
    : { from: config.from, to: [to], subject: bodies.subject, html: bodies.html, text: bodies.text };
  await postToResend(config, payload, fetchFn);
}

/** A plain notification email (order and delivery updates). Same contract as sendCodeEmail: reports only whether Resend accepted it. */
export async function sendNoticeEmail(config: ResendConfig, to: string, subject: string, text: string, fetchFn: FetchLike): Promise<void> {
  if (!looksLikeEmail(to) || subject.length === 0 || text.length === 0) throw new Error("Invalid email arguments");
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>");
  await postToResend(config, { from: config.from, to: [to], subject: subject.slice(0, 200), text, html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">${escaped}</div>` }, fetchFn);
}
