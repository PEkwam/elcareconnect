// Phone helpers backed by libphonenumber-js. One canonical E.164 form everywhere.
// Default country is Ghana (+233).
import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js";

const DEFAULT_COUNTRY: CountryCode = "GH";

/**
 * Normalize a raw phone string to E.164 (e.g. "0241234567" -> "+233241234567").
 * Returns "" for blank input, and "" when the input cannot be parsed at all.
 * Does NOT enforce validity — pair with isE164/toValidE164 when validity matters.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed) return parsed.number; // E.164
  // Fallback: bare digits with default country prefix so callers can still
  // surface a recognizable error without crashing on partial input.
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  return "";
}

/** True when the string is a valid E.164 number for some country. */
export function isE164(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!/^\+[1-9]\d{6,14}$/.test(value)) return false;
  return isValidPhoneNumber(value);
}

/** Normalize then validate. Returns null when not a valid number. */
export function toValidE164(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string | null {
  const n = normalizePhoneE164(raw, defaultCountry);
  return isE164(n) ? n : null;
}

/** Human-friendly international format for display. */
export function formatPhoneDisplay(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string {
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(String(raw).trim(), defaultCountry);
  return parsed ? parsed.formatInternational() : String(raw);
}
