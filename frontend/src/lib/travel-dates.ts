/**
 * Commercial travel date rules (mirror of backend/src/lib/travel-dates.ts).
 */

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

export function todayYmd(now: Date = new Date(), timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function normalizeYmd(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return s;
}

export function isPastYmd(date: string, today: string = todayYmd()): boolean {
  return date < today;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days, 12, 0, 0);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function defaultValidTill(days = 7): string {
  return addDaysYmd(todayYmd(), days);
}

export function travelDatesBlockReason(fields: {
  travelStartDate?: unknown;
  travelEndDate?: unknown;
  returnDate?: unknown;
  travelDates?: unknown;
  validTill?: unknown;
  estimatedBookingDate?: unknown;
  travelDate?: unknown;
  requireStart?: boolean;
}): string | null {
  const today = todayYmd();
  const start =
    normalizeYmd(fields.travelStartDate)
    || normalizeYmd(fields.travelDates)
    || normalizeYmd(fields.travelDate);
  const end = normalizeYmd(fields.travelEndDate) || normalizeYmd(fields.returnDate);
  const validTill = normalizeYmd(fields.validTill);
  const estimated = normalizeYmd(fields.estimatedBookingDate);

  if (fields.requireStart && !start) {
    return "Travel start date is required.";
  }
  if (start && isPastYmd(start, today)) {
    return "Travel start date cannot be in the past. Choose today or a future date.";
  }
  if (end && start && end < start) {
    return "Travel end / return date cannot be before the start date.";
  }
  if (end && !start && isPastYmd(end, today)) {
    return "Travel end date cannot be in the past.";
  }
  if (validTill && isPastYmd(validTill, today)) {
    return "Quote validity date cannot be in the past.";
  }
  if (estimated && isPastYmd(estimated, today)) {
    return "Estimated booking date cannot be in the past.";
  }
  if (estimated && start && estimated > start) {
    return "Estimated booking date must be on or before the travel start date.";
  }
  return null;
}
