// Deno-compatible phone helpers — mirror of src/lib/phone.ts.
import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from "npm:libphonenumber-js@1.13.7";

const DEFAULT_COUNTRY: CountryCode = "GH";

export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed) return parsed.number;
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : "";
}

export function isE164(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!/^\+[1-9]\d{6,14}$/.test(value)) return false;
  return isValidPhoneNumber(value);
}

export function toValidE164(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string | null {
  const n = normalizePhoneE164(raw, defaultCountry);
  return isE164(n) ? n : null;
}
