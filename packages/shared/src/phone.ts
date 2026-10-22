// Saudi mobile numbers: accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX.
// Arabic-Indic digits (٠-٩) are converted first, since owners often type them on Arabic keyboards.

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to 0-9, leaving everything else as typed. */
export function toLatinDigits(input: string): string {
  return input.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    // ٠ = U+0660, ۰ = U+06F0
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Returns the number in E.164 form (+9665XXXXXXXX), or null if it is not a valid Saudi mobile number. */
export function normalizeSaudiPhone(input: string): string | null {
  let digits = toLatinDigits(input).replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^5\d{8}$/.test(digits)) return null;
  return `+966${digits}`;
}

/** Supabase Auth stores phones without the leading "+". */
export function toAuthPhone(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Display form: 05X XXX XXXX */
export function formatSaudiPhone(e164: string): string {
  const local = "0" + e164.replace(/^\+?966/, "");
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
