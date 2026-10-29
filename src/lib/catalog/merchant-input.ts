import { normalizeEgyptPhone, toLatinDigits } from "../auth/phone";
import { cleanText } from "./product-input";

export interface MerchantInput {
  name: string;
  description: string | null;
  businessType: string;
  phone: string | null; // E.164, optional business contact
  address: string | null;
  lat: number | null;
  lng: number | null;
}
export type MerchantField = "name" | "description" | "businessType" | "phone" | "address" | "location";
export type MerchantResult = { ok: true; value: MerchantInput } | { ok: false; errors: Partial<Record<MerchantField, string>> };

function parseCoordinate(raw: string): number | null {
  const text = toLatinDigits(raw).trim().replace(/[٫,]/g, ".");
  return /^-?\d{1,3}(\.\d{1,7})?$/.test(text) ? Number(text) : null;
}

export function validateMerchantInput(raw: { name?: string; description?: string; businessType?: string; phone?: string; address?: string; lat?: string; lng?: string }): MerchantResult {
  const errors: Partial<Record<MerchantField, string>> = {};
  const name = cleanText(raw.name ?? "");
  if (name.length < 2 || name.length > 80) errors.name = "اكتب اسم النشاط (من حرفين إلى 80 حرفاً).";
  const description = cleanText(raw.description ?? "");
  if (description.length > 500) errors.description = "الوصف طويل جداً (الحد 500 حرف).";
  const businessType = (raw.businessType ?? "").trim();
  if (!/^[a-z][a-z0-9_]{1,29}$/.test(businessType)) errors.businessType = "اختر نوع النشاط.";

  let phone: string | null = null;
  const phoneText = (raw.phone ?? "").trim();
  if (phoneText) {
    phone = normalizeEgyptPhone(phoneText);
    if (!phone) errors.phone = "اكتب رقم موبايل مصري صحيح أو اتركه فارغاً.";
  }
  const address = cleanText(raw.address ?? "");
  if (address.length > 200) errors.address = "العنوان طويل جداً (الحد 200 حرف).";

  let lat: number | null = null;
  let lng: number | null = null;
  const latText = (raw.lat ?? "").trim();
  const lngText = (raw.lng ?? "").trim();
  if (latText || lngText) {
    lat = parseCoordinate(latText);
    lng = parseCoordinate(lngText);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) errors.location = "أدخل خط العرض والطول معاً بشكل صحيح أو اتركهما فارغين.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, description: description || null, businessType, phone, address: address || null, lat, lng } };
}

// ───────────── categories and business types (admin) ─────────────

export interface CategoryInput {
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
}
export type CategoryField = "nameAr" | "nameEn" | "sortOrder";
export type CategoryResult = { ok: true; value: CategoryInput } | { ok: false; errors: Partial<Record<CategoryField, string>> };

export function validateCategoryInput(raw: { nameAr?: string; nameEn?: string; sortOrder?: string }): CategoryResult {
  const errors: Partial<Record<CategoryField, string>> = {};
  const nameAr = cleanText(raw.nameAr ?? "");
  if (nameAr.length < 2 || nameAr.length > 60) errors.nameAr = "اكتب الاسم العربي (من حرفين إلى 60 حرفاً).";
  const nameEn = cleanText(raw.nameEn ?? "");
  if (nameEn.length > 60) errors.nameEn = "الاسم الإنجليزي طويل جداً.";
  const orderText = toLatinDigits(raw.sortOrder ?? "").trim();
  let sortOrder = 0;
  if (orderText) {
    if (!/^\d{1,4}$/.test(orderText)) errors.sortOrder = "الترتيب رقم من 0 إلى 9999.";
    else sortOrder = Number(orderText);
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { nameAr, nameEn: nameEn || null, sortOrder } };
}

export type BusinessTypeResult = { ok: true; value: { code: string; nameAr: string } } | { ok: false; errors: Partial<Record<"code" | "nameAr", string>> };

export function validateBusinessTypeInput(raw: { code?: string; nameAr?: string }): BusinessTypeResult {
  const errors: Partial<Record<"code" | "nameAr", string>> = {};
  const code = (raw.code ?? "").trim();
  if (!/^[a-z][a-z0-9_]{1,29}$/.test(code)) errors.code = "الرمز حروف إنجليزية صغيرة وأرقام و _ فقط (من 2 إلى 30).";
  const nameAr = cleanText(raw.nameAr ?? "");
  if (nameAr.length < 2 || nameAr.length > 40) errors.nameAr = "اكتب الاسم العربي (من حرفين إلى 40 حرفاً).";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { code, nameAr } };
}
