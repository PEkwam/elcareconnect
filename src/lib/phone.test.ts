import { describe, it, expect } from "vitest";
import { normalizePhoneE164, isE164, toValidE164 } from "./phone";

describe("phone E.164 helpers (Ghana default)", () => {
  it("normalizes a Ghanaian local number with leading zero", () => {
    expect(normalizePhoneE164("0244000000")).toBe("+233244000000");
  });

  it("preserves an already E.164 number unchanged", () => {
    expect(normalizePhoneE164("+233244000000")).toBe("+233244000000");
  });

  it("normalizes a number with formatting noise", () => {
    expect(normalizePhoneE164("+233 244-000 000")).toBe("+233244000000");
  });

  it("returns empty string for blank input", () => {
    expect(normalizePhoneE164("")).toBe("");
    expect(normalizePhoneE164(null)).toBe("");
    expect(normalizePhoneE164(undefined)).toBe("");
  });

  it("isE164 accepts valid international numbers", () => {
    expect(isE164("+233244000000")).toBe(true);
    expect(isE164("+14155552671")).toBe(true);
  });

  it("isE164 rejects malformed numbers", () => {
    expect(isE164("+1-800-555")).toBe(false);
    expect(isE164("0244000000")).toBe(false); // missing country prefix
    expect(isE164("")).toBe(false);
    expect(isE164(null)).toBe(false);
    expect(isE164("+0123")).toBe(false); // country code starts with 0
  });

  it("toValidE164 returns null for unparseable input", () => {
    expect(toValidE164("not-a-number")).toBe(null);
    expect(toValidE164("123")).toBe(null);
  });

  it("toValidE164 normalizes + validates in one step", () => {
    expect(toValidE164("0244000000")).toBe("+233244000000");
    expect(toValidE164("+233244000000")).toBe("+233244000000");
  });
});
