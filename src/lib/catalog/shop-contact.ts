import { normalizeEgyptPhone, toLatinDigits } from "../auth/phone";

export const SOCIAL_KEYS = ["facebook", "instagram", "tiktok", "whatsapp", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type SocialLinks = Partial<Record<SocialKey, string>>;

export const MAX_CONTACT_PHONES = 5;

/** A public contact number: an Egyptian mobile (stored as +20...) or a landline / hotline (digits only, 5 to 15). */
function cleanContactNumber(raw: string): string | null {
  const mobile = normalizeEgyptPhone(raw);
  if (mobile) return mobile;
  const digits = toLatinDigits(raw).replace(/[\s\-().]/g, "");
  return /^\+?\d{5,15}$/.test(digits) ? digits : null;
}

const HOSTS: Partial<Record<SocialKey, string[]>> = {
  facebook: ["facebook.com", "fb.com", "fb.me"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
};

/** Accept only plain https links (never javascript:, data:, credentials in the URL); social links must be on the platform's own domain. */
function cleanUrl(raw: string, key: SocialKey): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 200) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = HOSTS[key];
  if (allowed && !allowed.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (!host.includes(".")) return null;
  return url.href;
}

export type ShopContactInput = { contactPhones: string[]; socialLinks: SocialLinks | null };
export type ShopContactField = "contactPhones" | SocialKey;
export type ShopContactResult = { ok: true; value: ShopContactInput } | { ok: false; errors: Partial<Record<ShopContactField, string>> };

/** `phones` is free text with one number per line or separated by commas. WhatsApp is a mobile number; the rest are links. */
export function validateShopContact(raw: { phones?: string } & Partial<Record<SocialKey, string>>): ShopContactResult {
  const errors: Partial<Record<ShopContactField, string>> = {};
  const contactPhones: string[] = [];
  for (const part of (raw.phones ?? "").split(/[\n,،;]+/).map((x) => x.trim()).filter(Boolean)) {
    const phone = cleanContactNumber(part);
    if (!phone) {
      errors.contactPhones = `الرقم "${part.slice(0, 20)}" غير صحيح.`;
      break;
    }
    if (!contactPhones.includes(phone)) contactPhones.push(phone);
  }
  if (!errors.contactPhones && contactPhones.length > MAX_CONTACT_PHONES) errors.contactPhones = `الحد الأقصى ${MAX_CONTACT_PHONES} أرقام.`;

  const links: SocialLinks = {};
  for (const key of SOCIAL_KEYS) {
    const value = (raw[key] ?? "").trim();
    if (!value) continue;
    if (key === "whatsapp") {
      const phone = normalizeEgyptPhone(value);
      if (!phone) errors.whatsapp = "اكتب رقم واتساب مصري صحيح.";
      else links.whatsapp = phone;
      continue;
    }
    const url = cleanUrl(value, key);
    if (!url) errors[key] = key === "website" ? "اكتب رابطاً صحيحاً يبدأ بـ https://" : "اكتب رابط الصفحة الصحيح (يبدأ بـ https:// ومن موقع المنصة نفسها).";
    else links[key] = url;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { contactPhones, socialLinks: Object.keys(links).length ? links : null } };
}

/** Read links back from the database JSON, ignoring anything that is not a valid value. Used before rendering them as links. */
export function parseSocialLinks(json: unknown): SocialLinks {
  if (typeof json !== "object" || json === null) return {};
  const out: SocialLinks = {};
  for (const key of SOCIAL_KEYS) {
    const v = (json as Record<string, unknown>)[key];
    if (typeof v !== "string") continue;
    if (key === "whatsapp") {
      if (/^\+20\d{10}$/.test(v)) out.whatsapp = v;
    } else if (cleanUrl(v, key)) out[key] = v;
  }
  return out;
}
