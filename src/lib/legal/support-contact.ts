/** The line in the support page's draft text that waits for the owner's official contact details. */
export const SUPPORT_PLACEHOLDER = "[تضيف الإدارة هنا وسائل التواصل الرسمية بعد اعتمادها]";

const WHATSAPP = /^\+?[0-9]{8,15}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Fills the support page's placeholder with the owner's contact lines. Returns the new text, or null when there is
 * nothing to do (no valid contact given, or the placeholder is no longer in the text because someone edited it).
 */
export function applySupportContact(body: string, contact: { whatsapp?: string; email?: string }): string | null {
  const whatsapp = (contact.whatsapp ?? "").replace(/[\s-]/g, "");
  const email = (contact.email ?? "").trim();
  const lines: string[] = [];
  if (whatsapp !== "" && WHATSAPP.test(whatsapp)) lines.push(`- واتساب: ${whatsapp}`);
  if (email !== "" && EMAIL.test(email)) lines.push(`- البريد الإلكتروني: ${email}`);
  if (lines.length === 0 || !body.includes(SUPPORT_PLACEHOLDER)) return null;
  return body.replace(SUPPORT_PLACEHOLDER, lines.join("\n"));
}
