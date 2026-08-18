import { db } from "./db.js";
import type { AuthRequest } from "../middleware/auth.js";

export const QUOTE_STATUSES = [
  "Draft",
  "In Progress",
  "Pending Approval",
  "Sent to Agent",
  "Customer Reviewing",
  "Revision Requested",
  "Accepted",
  "Rejected",
  "Expired",
  "Converted to Booking",
  "Archived",
  "Sent", // legacy alias → treat as Sent to Agent
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Allowed transitions (legacy "Sent" maps to Sent to Agent). */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ["In Progress", "Pending Approval", "Archived"],
  "In Progress": ["Draft", "Pending Approval", "Archived"],
  "Pending Approval": ["In Progress", "Sent to Agent", "Sent", "Rejected"],
  "Sent to Agent": ["Customer Reviewing", "Expired", "Accepted", "Rejected", "Revision Requested"],
  Sent: ["Customer Reviewing", "Expired", "Accepted", "Rejected", "Revision Requested"],
  "Customer Reviewing": ["Accepted", "Rejected", "Revision Requested", "Expired"],
  "Revision Requested": ["In Progress", "Pending Approval"],
  Accepted: ["Converted to Booking", "Expired"],
  Rejected: ["In Progress", "Archived"],
  Expired: ["In Progress", "Sent to Agent", "Sent"],
  "Converted to Booking": ["Archived"],
  Archived: [],
};

export function canTransition(from: string, to: string, override = false): boolean {
  if (override) return true;
  if (from === to) return true;
  const allowed = STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function normalizeStatus(status: string): string {
  if (status === "Sent") return "Sent to Agent";
  return status;
}

export async function nextQuoteNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TG-QT-${year}-`;
  const latest = await db.quotation.findFirst({
    where: { quoteNo: { startsWith: prefix } },
    orderBy: { quoteNo: "desc" },
    select: { quoteNo: true },
  });
  let seq = 1;
  if (latest?.quoteNo) {
    const n = parseInt(latest.quoteNo.slice(prefix.length), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  } else {
    // migrate from QT-YYYY-NNN style count
    const count = await db.quotation.count();
    seq = count + 1;
  }
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

export type CostLine = {
  costPrice?: number;
  sellingPrice?: number;
  qty?: number;
  quantity?: number;
  adultRate?: number;
  childRate?: number;
  adults?: number;
  children?: number;
};

export function lineTotals(line: CostLine) {
  const qty = Number(line.qty ?? line.quantity ?? 1) || 1;
  let selling = Number(line.sellingPrice ?? 0);
  let cost = Number(line.costPrice ?? 0);
  if (line.adultRate != null || line.childRate != null) {
    selling =
      Number(line.adultRate || 0) * Number(line.adults || 0) +
      Number(line.childRate || 0) * Number(line.children || 0);
    if (!cost) cost = Math.round(selling * 0.75);
  } else {
    selling = selling * qty;
    cost = cost * qty;
  }
  return { cost, selling, profit: selling - cost };
}

export function sumServiceLines(lines: unknown): { cost: number; selling: number } {
  if (!Array.isArray(lines)) return { cost: 0, selling: 0 };
  return lines.reduce(
    (acc, line) => {
      const t = lineTotals(line as CostLine);
      return { cost: acc.cost + t.cost, selling: acc.selling + t.selling };
    },
    { cost: 0, selling: 0 },
  );
}

export function calcPackageCosting(pkg: {
  hotels?: unknown;
  flights?: unknown;
  transfers?: unknown;
  activities?: unknown;
  meals?: unknown;
  addOns?: unknown;
  visa?: { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null;
  insurance?: { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null;
  taxRate?: number;
  discountType?: string | null;
  discountValue?: number;
  adults?: number;
  children?: number;
  infants?: number;
}) {
  const parts = [
    sumServiceLines(pkg.hotels),
    sumServiceLines(pkg.flights),
    sumServiceLines(pkg.transfers),
    sumServiceLines(pkg.activities),
    sumServiceLines(pkg.meals),
    sumServiceLines(pkg.addOns),
  ];
  let totalNetCost = parts.reduce((s, p) => s + p.cost, 0);
  let totalSelling = parts.reduce((s, p) => s + p.selling, 0);
  if (pkg.visa?.enabled) {
    totalNetCost += Number(pkg.visa.costPrice || 0);
    totalSelling += Number(pkg.visa.sellingPrice || 0);
  }
  if (pkg.insurance?.enabled) {
    totalNetCost += Number(pkg.insurance.costPrice || 0);
    totalSelling += Number(pkg.insurance.sellingPrice || 0);
  }

  let discountAmount = 0;
  if (pkg.discountType === "Percentage") {
    discountAmount = Math.round(totalSelling * (Number(pkg.discountValue || 0) / 100));
  } else if (pkg.discountType === "Fixed") {
    discountAmount = Math.round(Number(pkg.discountValue || 0));
  }
  discountAmount = Math.min(discountAmount, totalSelling);
  const afterDiscount = totalSelling - discountAmount;
  const taxRate = Number(pkg.taxRate ?? 18);
  const gst = Math.round(afterDiscount * (taxRate / (100 + taxRate)));
  const taxableAmount = afterDiscount - gst;
  const grossProfit = afterDiscount - totalNetCost;
  const profitMargin = afterDiscount > 0 ? (grossProfit / afterDiscount) * 100 : 0;
  const pax = Math.max(1, Number(pkg.adults || 0) + Number(pkg.children || 0));
  const perPersonCost = Math.round(afterDiscount / pax);

  return {
    totalNetCost,
    totalSelling: afterDiscount,
    grossProfit,
    profitMargin: Math.round(profitMargin * 100) / 100,
    discountAmount,
    taxableAmount,
    gst,
    total: afterDiscount,
    perPersonCost,
  };
}

export function maxDiscountPercent(role?: string): number {
  if (!role) return 5;
  if (["super_admin", "agency_admin"].includes(role)) return 100;
  if (["branch_manager", "management"].includes(role)) return 25;
  if (["sales_executive", "employee"].includes(role)) return 10;
  if (role === "accountant") return 15;
  return 5;
}

export function isAgentLike(role?: string): boolean {
  return role === "travel_agent" || role === "customer";
}

/** Strip confidential fields for agents/customers. */
export function sanitizeQuotationForRole<T extends Record<string, unknown>>(quote: T, role?: string): T {
  if (!isAgentLike(role)) return quote;
  const clone = JSON.parse(JSON.stringify(quote)) as Record<string, unknown>;
  delete clone.internalNotes;
  delete clone.totalNetCost;
  delete clone.grossProfit;
  delete clone.profitMargin;
  delete clone.discountType;
  delete clone.discountValue;
  // keep discountAmount as customer-facing if needed — hide cost internals
  if (Array.isArray(clone.packages)) {
    clone.packages = (clone.packages as Record<string, unknown>[]).map((p) => sanitizePackage(p));
  }
  if (Array.isArray(clone.approvals)) {
    clone.approvals = (clone.approvals as Record<string, unknown>[]).map((a) => ({
      stage: a.stage,
      status: a.status,
      decidedAt: a.decidedAt,
    }));
  }
  delete clone.versions;
  return clone as T;
}

function sanitizePackage(pkg: Record<string, unknown>) {
  const next = { ...pkg };
  delete next.totalNetCost;
  delete next.grossProfit;
  for (const key of ["hotels", "flights", "transfers", "activities", "meals", "addOns"] as const) {
    if (Array.isArray(next[key])) {
      next[key] = (next[key] as Record<string, unknown>[]).map((line) => {
        const l = { ...line };
        delete l.costPrice;
        delete l.supplier;
        delete l.supplierId;
        delete l.supplierRef;
        return l;
      });
    }
  }
  if (next.visa && typeof next.visa === "object") {
    const v = { ...(next.visa as Record<string, unknown>) };
    delete v.costPrice;
    next.visa = v;
  }
  if (next.insurance && typeof next.insurance === "object") {
    const v = { ...(next.insurance as Record<string, unknown>) };
    delete v.costPrice;
    next.insurance = v;
  }
  return next;
}

export const QUOTE_INCLUDE = {
  packages: { orderBy: { sortOrder: "asc" as const } },
  versions: { orderBy: { versionNumber: "desc" as const }, take: 20 },
  approvals: { orderBy: { createdAt: "asc" as const } },
  revisions: { orderBy: { createdAt: "desc" as const } },
  shares: { orderBy: { createdAt: "desc" as const }, take: 20 },
  documents: { orderBy: { createdAt: "desc" as const } },
} as const;

export async function writeQuoteAudit(opts: {
  req?: AuthRequest;
  agencyId?: string | null;
  quotationId: string;
  action: string;
  previousValue?: unknown;
  updatedValue?: unknown;
  details?: string;
}) {
  await db.auditLog.create({
    data: {
      userId: opts.req?.auth?.userId,
      agencyId: opts.agencyId ?? opts.req?.auth?.agencyId ?? undefined,
      userName: opts.req?.auth?.email || "System",
      userRole: opts.req?.auth?.role,
      action: opts.action,
      module: "quotations",
      ip: opts.req?.ip,
      details: opts.details || opts.quotationId,
      previousValue: opts.previousValue as object | undefined,
      updatedValue: opts.updatedValue as object | undefined,
    },
  });
}

export async function notifyQuote(opts: {
  agencyId?: string | null;
  title: string;
  message: string;
  priority?: string;
}) {
  await db.notification.create({
    data: {
      type: "internal",
      title: opts.title,
      message: opts.message,
      priority: opts.priority || "medium",
      agencyId: opts.agencyId ?? undefined,
    },
  });
}

export function nightsBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildTermsSnapshot(q: {
  termsAndConditions?: string | null;
  paymentTerms?: string | null;
  cancellationPolicy?: string | null;
  refundPolicy?: string | null;
  hotelTerms?: string | null;
  flightTerms?: string | null;
  visaTerms?: string | null;
  insuranceTerms?: string | null;
  forceMajeure?: string | null;
  travelDisclaimer?: string | null;
}) {
  return {
    termsAndConditions: q.termsAndConditions,
    paymentTerms: q.paymentTerms,
    cancellationPolicy: q.cancellationPolicy,
    refundPolicy: q.refundPolicy,
    hotelTerms: q.hotelTerms,
    flightTerms: q.flightTerms,
    visaTerms: q.visaTerms,
    insuranceTerms: q.insuranceTerms,
    forceMajeure: q.forceMajeure,
    travelDisclaimer: q.travelDisclaimer,
    snappedAt: new Date().toISOString(),
  };
}

export async function expireDueQuotations(agencyWhere: Record<string, unknown>) {
  const today = new Date().toISOString().slice(0, 10);
  const due = await db.quotation.findMany({
    where: {
      ...agencyWhere,
      deletedAt: null,
      status: { in: ["Sent to Agent", "Sent", "Customer Reviewing"] },
      validTill: { lt: today },
    },
    take: 200,
    select: { id: true, quoteNo: true, agencyId: true },
  });
  for (const q of due) {
    await db.quotation.update({ where: { id: q.id }, data: { status: "Expired" } });
    await notifyQuote({ agencyId: q.agencyId, title: "Quote expired", message: `${q.quoteNo} expired` });
  }
  return due.length;
}

export async function restorePackagesFromSnapshot(quotationId: string, snapshot: Record<string, unknown>) {
  const packages = Array.isArray(snapshot.packages) ? (snapshot.packages as Record<string, unknown>[]) : [];
  await db.quotationPackage.deleteMany({ where: { quotationId } });
  for (const rec of packages) {
    await db.quotationPackage.create({
      data: {
        quotationId,
        name: String(rec.name || "Package"),
        sortOrder: Number(rec.sortOrder || 0),
        isSelected: Boolean(rec.isSelected),
        description: rec.description != null ? String(rec.description) : undefined,
        hotels: (rec.hotels as object) ?? [],
        flights: (rec.flights as object) ?? [],
        transfers: (rec.transfers as object) ?? [],
        activities: (rec.activities as object) ?? [],
        meals: (rec.meals as object) ?? [],
        itinerary: (rec.itinerary as object) ?? [],
        visa: rec.visa != null ? (rec.visa as object) : undefined,
        insurance: rec.insurance != null ? (rec.insurance as object) : undefined,
        addOns: (rec.addOns as object) ?? [],
        inclusions: (rec.inclusions as object) ?? [],
        exclusions: (rec.exclusions as object) ?? [],
        totalNetCost: Number(rec.totalNetCost || 0),
        totalSelling: Number(rec.totalSelling || 0),
        grossProfit: Number(rec.grossProfit || 0),
        gst: Number(rec.gst || 0),
        total: Number(rec.total || 0),
        perPersonCost: Number(rec.perPersonCost || 0),
      },
    });
  }
}

export async function snapshotVersion(
  quotationId: string,
  createdByName: string,
  createdById?: string,
  changeSummary?: string,
  reason?: string,
) {
  const full = await db.quotation.findUnique({
    where: { id: quotationId },
    include: QUOTE_INCLUDE,
  });
  if (!full) return null;
  const versionNumber = (full.currentVersion || 1) + 1;
  const version = await db.quotationVersion.create({
    data: {
      quotationId,
      versionNumber,
      snapshot: JSON.parse(JSON.stringify(full)),
      changeSummary: changeSummary || `Version ${versionNumber}`,
      reason,
      createdByName,
      createdById,
    },
  });
  await db.quotation.update({
    where: { id: quotationId },
    data: { currentVersion: versionNumber },
  });
  return version;
}
