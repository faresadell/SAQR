"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCairoLocal } from "@/lib/cairo-time";
import { parsePercentToBasisPoints } from "@/lib/commission";
import { parseEffectiveFrom } from "@/lib/effective";
import type { FormState } from "@/lib/form-state";
import { parseEgp, MoneyError } from "@/lib/money";
import { toLatinDigits } from "@/lib/auth/phone";
import { getSettingAt } from "@/lib/settings";
import {
  SETTING_DEFINITIONS,
  parseSettingInput,
  settingKeysInGroup,
  type IntSettingDefinition,
} from "@/lib/settings-registry";
import { requirePermission } from "@/server/auth/guards";
import { scheduleCommissionRate } from "@/server/commissions/service";
import { createZone, scheduleZoneFee, setZoneActive } from "@/server/delivery/zones";
import { setPaymentMethodEnabled } from "@/server/payments/methods";
import { changeSetting } from "@/server/settings/service";
import { AuthorizationError, NotFoundError } from "@/server/errors";

const GENERIC = "حدث خطأ غير متوقع. حاول مرة أخرى.";
const DENIED = "ليست لديك صلاحية لهذا الإجراء.";

const dateMessages = {
  INVALID_DATE: "تاريخ السريان غير صحيح.",
  IN_PAST: "لا يمكن أن يكون تاريخ السريان في الماضي.",
  TOO_FAR: "تاريخ السريان بعيد جداً (الحد الأقصى سنة).",
} as const;

/** The datetime-local box is Cairo time; convert it to an exact instant before it reaches the services. */
function readEffectiveFrom(formData: FormData): { ok: true; iso: string | null } | { ok: false; error: string } {
  const raw = String(formData.get("effectiveFrom") ?? "").trim();
  if (!raw) return { ok: true, iso: null };
  const date = parseCairoLocal(raw);
  return date ? { ok: true, iso: date.toISOString() } : { ok: false, error: dateMessages.INVALID_DATE };
}

function toFailure(error: unknown): FormState {
  if (error instanceof AuthorizationError) return { error: DENIED };
  if (error instanceof NotFoundError) return { error: "العنصر غير موجود." };
  console.error(error);
  return { error: GENERIC };
}

// ───────────── Operational settings (one form per group) ─────────────

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("settings.manage");
  try {
    const group = z.enum(["orders", "security"]).safeParse(formData.get("group"));
    if (!group.success) return { error: GENERIC };

    const when = readEffectiveFrom(formData);
    if (!when.ok) return { fieldErrors: { effectiveFrom: when.error } };
    const now = new Date();
    const dateCheck = parseEffectiveFrom(when.iso, now);
    if (!dateCheck.ok) return { fieldErrors: { effectiveFrom: dateMessages[dateCheck.error] } };

    // Validate EVERYTHING first so one bad field saves nothing.
    const keys = settingKeysInGroup(group.data);
    const fieldErrors: Record<string, string> = {};
    const changes: { key: (typeof keys)[number]; raw: string }[] = [];
    for (const key of keys) {
      const raw = toLatinDigits(String(formData.get(`s:${key}`) ?? "")).trim();
      const parsed = parseSettingInput(key, raw);
      if (!parsed.ok) {
        // Widen from the literal `as const` types so min/max can be compared.
        const def: IntSettingDefinition = SETTING_DEFINITIONS[key];
        fieldErrors[key] = def.min === def.max ? "قيمة غير صالحة." : `القيمة يجب أن تكون رقماً بين ${def.min} و${def.max}.`;
        continue;
      }
      if (parsed.value !== (await getSettingAt(key, now))) changes.push({ key, raw });
    }
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
    if (changes.length === 0) return { message: "لا توجد تغييرات للحفظ." };

    for (const change of changes) {
      const result = await changeSetting(user, change.key, change.raw, when.iso);
      if (!result.ok) return { error: "تعذر حفظ أحد الإعدادات. راجع القيم وحاول مرة أخرى." };
    }
    revalidatePath("/admin/settings");
    return { message: `تم حفظ ${changes.length} تغيير وتسجيله في سجل المراجعة.` };
  } catch (error) {
    return toFailure(error);
  }
}

// ───────────── Commissions ─────────────

const commissionSchema = z.object({
  tier: z.enum(["REGULAR", "BUSINESS"], { message: "اختر العضوية." }),
  percent: z.string().max(10),
});

export async function scheduleCommissionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("settings.manage");
  try {
    const parsed = commissionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { fieldErrors: { tier: "اختر العضوية." } };
    const basisPoints = parsePercentToBasisPoints(parsed.data.percent);
    if (basisPoints === null) return { fieldErrors: { percent: "اكتب نسبة بين 0 و50 (حتى رقمين عشريين)." } };
    const when = readEffectiveFrom(formData);
    if (!when.ok) return { fieldErrors: { effectiveFrom: when.error } };

    const result = await scheduleCommissionRate(user, parsed.data.tier, basisPoints, when.iso);
    if (!result.ok) {
      if (result.error === "INVALID_RATE") return { fieldErrors: { percent: "نسبة غير صالحة." } };
      return { fieldErrors: { effectiveFrom: dateMessages[result.error] } };
    }
    revalidatePath("/admin/settings");
    return { message: "تم جدولة النسبة وتسجيلها. لا تتأثر الطلبات السابقة." };
  } catch (error) {
    return toFailure(error);
  }
}

// ───────────── Payment methods ─────────────

export async function togglePaymentMethodAction(formData: FormData): Promise<void> {
  const { user } = await requirePermission("settings.manage");
  const parsed = z.object({ code: z.string().min(1).max(40), enabled: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/settings?notice=invalid");
  let notice = "done";
  try {
    await setPaymentMethodEnabled(user, parsed.data.code, parsed.data.enabled === "true");
  } catch (error) {
    if (error instanceof AuthorizationError) notice = "forbidden";
    else if (error instanceof NotFoundError) notice = "missing";
    else throw error;
  }
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?notice=${notice}#payments`);
}

// ───────────── Delivery zones ─────────────

function readFeeCents(formData: FormData): number | null {
  try {
    return parseEgp(toLatinDigits(String(formData.get("fee") ?? "")));
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

const zoneErrors = {
  INVALID_NAME: "اكتب اسماً من حرفين إلى 80 حرفاً.",
  INVALID_FEE: "الرسوم يجب أن تكون بين 0 و1000 جنيه.",
} as const;

export async function createZoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("settings.manage");
  try {
    const fee = readFeeCents(formData);
    if (fee === null) return { fieldErrors: { fee: zoneErrors.INVALID_FEE } };
    const result = await createZone(user, String(formData.get("name") ?? ""), fee);
    if (!result.ok) {
      return result.error === "INVALID_NAME" ? { fieldErrors: { name: zoneErrors.INVALID_NAME } } : { fieldErrors: { fee: zoneErrors.INVALID_FEE } };
    }
    revalidatePath("/admin/settings");
    return { message: "تمت إضافة المنطقة." };
  } catch (error) {
    return toFailure(error);
  }
}

export async function scheduleZoneFeeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePermission("settings.manage");
  try {
    const zoneId = z.string().min(1).max(64).safeParse(formData.get("zoneId"));
    if (!zoneId.success) return { error: GENERIC };
    const fee = readFeeCents(formData);
    if (fee === null) return { fieldErrors: { fee: zoneErrors.INVALID_FEE } };
    const when = readEffectiveFrom(formData);
    if (!when.ok) return { fieldErrors: { effectiveFrom: when.error } };

    const result = await scheduleZoneFee(user, zoneId.data, fee, when.iso);
    if (!result.ok) {
      if (result.error === "INVALID_FEE" || result.error === "INVALID_NAME") return { fieldErrors: { fee: zoneErrors.INVALID_FEE } };
      return { fieldErrors: { effectiveFrom: dateMessages[result.error] } };
    }
    revalidatePath("/admin/settings");
    return { message: "تم تسجيل الرسوم الجديدة. لا تتأثر الطلبات السابقة." };
  } catch (error) {
    return toFailure(error);
  }
}

export async function setZoneActiveAction(formData: FormData): Promise<void> {
  const { user } = await requirePermission("settings.manage");
  const parsed = z.object({ zoneId: z.string().min(1).max(64), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/settings?notice=invalid");
  let notice = "done";
  try {
    await setZoneActive(user, parsed.data.zoneId, parsed.data.active === "true");
  } catch (error) {
    if (error instanceof AuthorizationError) notice = "forbidden";
    else if (error instanceof NotFoundError) notice = "missing";
    else throw error;
  }
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?notice=${notice}#delivery`);
}
