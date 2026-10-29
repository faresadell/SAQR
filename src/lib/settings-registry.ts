// Registry of editable business settings (no framework imports, so it is easy to test).
// Values are always whole numbers. Ranges are enforced on the server for every write AND every read;
// an invalid stored value is ignored and the default is used, so a bad edit cannot weaken security.

export type SettingGroup = "orders" | "security";

export interface IntSettingDefinition {
  label: string;
  help?: string;
  group: SettingGroup;
  unit: string;
  min: number;
  max: number;
  nullable?: true;
  default: number | null;
}

export const SETTING_DEFINITIONS = {
  // ───── orders & stars ─────
  "orders.stars_charge_per_party": {
    label: "النجوم المخصومة من كل طرف عن كل طلب فرعي",
    help: "تُخصم من العميل ومن التاجر معاً عند موافقة التاجر على كل طلب فرعي، وتُسترجع مرة واحدة عند الإلغاء. الحد الأدنى للرصيد إعداد منفصل.",
    group: "orders", unit: "نجمة", min: 0, max: 50, default: 2,
  },
  "stars.min_balance_customer": {
    label: "الحد الأدنى لرصيد العميل لإرسال طلب",
    group: "orders", unit: "نجمة", min: 0, max: 50, default: 5,
  },
  "stars.min_balance_merchant": {
    label: "الحد الأدنى لرصيد التاجر لاستقبال الطلبات",
    group: "orders", unit: "نجمة", min: 0, max: 50, default: 5,
  },
  "refunds.deadline_hours": {
    label: "مهلة تنفيذ الاسترجاع للتاجر",
    help: "الحد الأقصى المتفق عليه 24 ساعة، ويمكن تقصيرها فقط.",
    group: "orders", unit: "ساعة", min: 1, max: 24, default: 24,
  },
  "orders.merchant_response_minutes": {
    label: "مهلة رد التاجر على الطلب",
    help: "غير محددة بعد. يجب تحديدها قبل تشغيل الطلبات، وبعدها يُنبَّه الأدمن لمتابعة الطلب.",
    group: "orders", unit: "دقيقة", min: 1, max: 10080, nullable: true, default: null,
  },

  // ───── security ─────
  "auth.otp.ttl_seconds": { label: "صلاحية رمز التحقق", group: "security", unit: "ثانية", min: 60, max: 900, default: 300 },
  "auth.otp.max_attempts": { label: "محاولات إدخال الرمز", group: "security", unit: "محاولة", min: 1, max: 10, default: 5 },
  "auth.otp.resend_cooldown_seconds": { label: "الانتظار قبل إعادة إرسال الرمز", group: "security", unit: "ثانية", min: 0, max: 600, default: 60 },
  "auth.otp.max_per_phone_per_hour": { label: "رموز التحقق لكل رقم في الساعة", group: "security", unit: "رمز", min: 1, max: 20, default: 5 },
  "auth.otp.max_per_ip_per_hour": { label: "رموز التحقق لكل IP في الساعة", group: "security", unit: "رمز", min: 1, max: 200, default: 20 },
  "auth.register.max_per_ip_per_hour": { label: "حسابات جديدة لكل IP في الساعة", group: "security", unit: "حساب", min: 1, max: 100, default: 10 },
  "auth.login.max_per_ip_per_10min": { label: "محاولات الدخول لكل IP كل 10 دقائق", group: "security", unit: "محاولة", min: 1, max: 500, default: 30 },
  "auth.login.max_per_phone_per_10min": { label: "محاولات الدخول لكل رقم كل 10 دقائق", group: "security", unit: "محاولة", min: 1, max: 100, default: 10 },
  "auth.login.max_failures": { label: "محاولات خاطئة قبل قفل الحساب", group: "security", unit: "محاولة", min: 3, max: 20, default: 5 },
  "auth.login.lock_minutes": { label: "مدة قفل الحساب", group: "security", unit: "دقيقة", min: 1, max: 1440, default: 15 },
  "auth.session.ttl_hours": { label: "مدة جلسة العملاء والتجار", group: "security", unit: "ساعة", min: 1, max: 2160, default: 720 },
  "auth.session.admin_ttl_hours": { label: "مدة جلسة المشرفين", group: "security", unit: "ساعة", min: 1, max: 168, default: 12 },
} as const satisfies Record<string, IntSettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFINITIONS)[K] extends { nullable: true } ? number | null : number;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_DEFINITIONS, key);
}

export function validateSettingValue(definition: IntSettingDefinition, value: unknown): value is number | null {
  if (value === null) return definition.nullable === true;
  return typeof value === "number" && Number.isInteger(value) && value >= definition.min && value <= definition.max;
}

export type ParsedSetting =
  | { ok: true; key: SettingKey; value: number | null }
  | { ok: false; error: "UNKNOWN_KEY" | "INVALID_VALUE" };

/** Parse the text typed in the dashboard. Empty means "not set" and is only allowed for nullable settings. */
export function parseSettingInput(key: string, raw: string): ParsedSetting {
  if (!isSettingKey(key)) return { ok: false, error: "UNKNOWN_KEY" };
  const definition: IntSettingDefinition = SETTING_DEFINITIONS[key];
  const trimmed = raw.trim();
  const candidate: number | null = trimmed === "" ? null : /^\d{1,7}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  return validateSettingValue(definition, candidate) ? { ok: true, key, value: candidate } : { ok: false, error: "INVALID_VALUE" };
}

export function settingKeysInGroup(group: SettingGroup): SettingKey[] {
  return (Object.keys(SETTING_DEFINITIONS) as SettingKey[]).filter((key) => SETTING_DEFINITIONS[key].group === group);
}
