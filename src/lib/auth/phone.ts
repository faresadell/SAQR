const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Convert Arabic-Indic and Persian digits to Latin digits. */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabic = ARABIC_INDIC.indexOf(ch);
    return String(arabic >= 0 ? arabic : EXTENDED_INDIC.indexOf(ch));
  });
}

/**
 * Normalize an Egyptian mobile number to E.164 (+20 1X XXXXXXXX).
 * Accepts 01012345678, +201012345678, 201012345678, 00201012345678 and Arabic digits.
 * Returns null for anything that is not a valid Egyptian mobile (010, 011, 012, 015).
 */
export function normalizeEgyptPhone(input: string): string | null {
  const cleaned = toLatinDigits(input).replace(/[\s\-().]/g, "");
  let national: string;
  if (/^\+20\d+$/.test(cleaned)) national = cleaned.slice(3);
  else if (/^0020\d+$/.test(cleaned)) national = cleaned.slice(4);
  else if (/^20\d{10}$/.test(cleaned)) national = cleaned.slice(2);
  else if (/^0\d{10}$/.test(cleaned)) national = cleaned.slice(1);
  else return null;
  return /^1[0125]\d{8}$/.test(national) ? `+20${national}` : null;
}
