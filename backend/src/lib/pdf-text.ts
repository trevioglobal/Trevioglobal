/** Helvetica (PDFKit built-in) cannot draw ₹, arrows, or stars — substitute ASCII. */
export function pdfSafeText(value: unknown, fallback = ""): string {
  const s = value == null ? fallback : String(value);
  return s
    .replace(/₹/g, "Rs ")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/★/g, "*")
    .replace(/•/g, "-")
    .replace(/[✓✔]/g, "+")
    .replace(/[♥❤♡]/g, "love")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-");
}

export function pdfMoney(amount: number, currency = "INR"): string {
  const n = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0));
  const code = (currency || "INR").toUpperCase();
  if (code === "INR") return `Rs ${n}`;
  return `${code} ${n}`;
}

export function nightLabel(nights: number): string {
  const n = Math.max(0, Math.round(Number(nights) || 0));
  return `${n} Night${n === 1 ? "" : "s"}`;
}
