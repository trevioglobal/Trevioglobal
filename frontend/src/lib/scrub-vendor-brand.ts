/**
 * Strip internal vendor brand names (e.g. KTH) from agent/customer-facing copy.
 * Source data may still reference the vendor; UI must never show it.
 */
export function scrubVendorBrand(value: unknown): string {
  const text = String(value ?? "");
  if (!text) return "";
  return text
    .replace(/\bKTH\s*Malaysia\b/gi, "Malaysia")
    .replace(/\(\s*KTH\s*\)/gi, "")
    .replace(/\bKTH\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s*·\s*/g, " · ")
    .replace(/^\s*[·|/,-]+\s*/g, "")
    .replace(/\s*[·|/,-]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** True when a supplier/label is an internal vendor that must stay hidden. */
export function isHiddenVendorName(value: unknown): boolean {
  return /\bKTH\b/i.test(String(value ?? ""));
}
