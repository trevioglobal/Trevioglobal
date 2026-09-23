import { db } from "./db.js";
import type { AuthRequest } from "../middleware/auth.js";
import { filterDocumentsForRole } from "./documents.js";

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

/**
 * Staff/agent authenticated accept must obey the same status machine as POST .../status.
 * Returns null when Accepted is allowed (including already-Accepted no-op via from===to).
 */
export function quoteStaffAcceptTransitionBlockReason(status: string | null | undefined): string | null {
  const from = status || "";
  const to = "Accepted";
  if (canTransition(from, to) || canTransition(normalizeStatus(from), to)) return null;
  return `Invalid transition ${from || "(empty)"} → ${to}`;
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
    if (!cost) cost = 0;
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
  // Legacy inclusive extractor — rate must be explicit. Never invent 18% (Phase 16).
  const taxRateRaw = pkg.taxRate;
  const taxRate = taxRateRaw == null || Number.isNaN(Number(taxRateRaw)) ? null : Number(taxRateRaw);
  const gst = taxRate == null
    ? 0
    : Math.round(afterDiscount * (taxRate / (100 + taxRate)));
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

/** Fixed-INR discount ceiling before manager approval is required. */
export function maxDiscountFixed(role?: string): number {
  if (!role) return 5_000;
  if (["super_admin", "agency_admin"].includes(role)) return Number.POSITIVE_INFINITY;
  if (["branch_manager", "management", "team_lead"].includes(role)) return 50_000;
  if (["sales_executive", "employee", "accountant"].includes(role)) return 10_000;
  return 5_000;
}

export function discountRequiresApproval(
  role: string | undefined,
  discountType?: string | null,
  discountValue?: number | null,
): boolean {
  const value = Number(discountValue || 0);
  if (!discountType || value <= 0) return false;
  if (["super_admin", "agency_admin"].includes(role || "")) return false;
  if (discountType === "Percentage") return value > maxDiscountPercent(role);
  if (discountType === "Fixed") return value > maxDiscountFixed(role);
  return false;
}

export function canApproveDiscount(role?: string): boolean {
  return ["super_admin", "agency_admin", "branch_manager", "management", "team_lead"].includes(role || "");
}

export function latestApprovalStage(
  approvals: Array<{ stage?: string | null; status?: string | null }> | null | undefined,
  stage: string,
): { stage?: string | null; status?: string | null } | undefined {
  if (!Array.isArray(approvals)) return undefined;
  for (let i = approvals.length - 1; i >= 0; i -= 1) {
    if (approvals[i]?.stage === stage) return approvals[i];
  }
  return undefined;
}

/** Blocks Team Lead / send flows while a discount request is outstanding. */
export function discountApprovalBlockReason(
  quote: {
    discountType?: string | null;
    discountValue?: number | null;
    approvals?: Array<{ stage?: string | null; status?: string | null }> | null;
  },
  actorRole?: string,
): string | null {
  const disc = latestApprovalStage(quote.approvals, "Discount");
  if (disc?.status === "Pending") {
    return "Discount approval is pending. A manager must approve the discount before continuing.";
  }
  if (disc?.status === "Rejected") {
    return "Discount was rejected. Reduce the discount or request approval again.";
  }
  // If discount currently exceeds what this actor can set alone and there is no Approved Discount row.
  if (discountRequiresApproval(actorRole, quote.discountType, quote.discountValue) && disc?.status !== "Approved") {
    return "This discount exceeds your approval limit. Request discount approval first.";
  }
  return null;
}

export type DiscountApprovalAction =
  | { action: "none" }
  | { action: "create"; status: "Pending" | "Approved"; comments: string };

/** Decide whether to append a Discount approval row after a discount change. */
export function nextDiscountApprovalAction(opts: {
  role?: string;
  discountType?: string | null;
  discountValue?: number | null;
  latestDiscountStatus?: string | null;
  /** When false, an existing Approved Discount is kept if still over limit. */
  discountChanged?: boolean;
}): DiscountApprovalAction {
  const needs = discountRequiresApproval(opts.role, opts.discountType, opts.discountValue);
  const latest = opts.latestDiscountStatus || null;
  const label = `${opts.discountType || "Discount"} ${opts.discountValue ?? 0}`;
  const changed = opts.discountChanged !== false;

  if (!needs) {
    if (latest === "Pending" || latest === "Rejected") {
      return { action: "create", status: "Approved", comments: "Discount within approval limit — auto-cleared" };
    }
    return { action: "none" };
  }

  if (canApproveDiscount(opts.role)) {
    if (latest !== "Approved") {
      return { action: "create", status: "Approved", comments: `${label} — within manager authority` };
    }
    return { action: "none" };
  }

  if (latest === "Pending") return { action: "none" };
  if (latest === "Approved" && !changed) return { action: "none" };
  return { action: "create", status: "Pending", comments: `Request: ${label}` };
}

export function isAgentLike(role?: string): boolean {
  return role === "travel_agent" || role === "customer";
}

const SENSITIVE_LINE_KEYS = [
  "costPrice", "quotedCostPrice", "contractedCost", "supplierCost", "supplier", "supplierId", "supplierRef", "supplierName",
  "trevioMarkup", "trevioMarkupType", "trevioMarkupValue", "trevioMarkupAmount",
  "totalNetCost", "grossProfit", "profitMargin",
  "discountType", "discountValue", "discountAmount",
  "internalNotes", "internalRemarks", "remarks",
] as const;

function stripSensitive(value: unknown, hideAgentMarkup: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => stripSensitive(item, hideAgentMarkup));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((SENSITIVE_LINE_KEYS as readonly string[]).includes(key)) continue;
    if (hideAgentMarkup && (key === "agentMarkup" || key === "agentMarkupType" || key === "agentMarkupAmount" || key === "baseSellingTotal" || key === "markup" || key === "trevioSellingPrice" || key === "totalSelling")) continue;
    if (key === "approvals" || key === "versions") continue;
    next[key] = stripSensitive(child, hideAgentMarkup);
  }
  return next;
}

function scrubDocuments<T extends Record<string, unknown>>(quote: T, role?: string): T {
  if (!Array.isArray(quote.documents)) return quote;
  const quoteId = typeof quote.id === "string" ? quote.id : "";
  const documents = filterDocumentsForRole(quote.documents as Array<{ id?: string; visibility?: unknown }>, role).map((doc) => ({
    ...doc,
    ...(quoteId && doc.id ? { downloadPath: `/api/quotations/${quoteId}/documents/${doc.id}/content` } : {}),
  }));
  return { ...quote, documents };
}

/** Strip confidential fields for agents/customers. Customers see selling price only. */
export function sanitizeQuotationForRole<T extends Record<string, unknown>>(quote: T, role?: string): T {
  if (!quote || typeof quote !== "object") return quote;
  if (!isAgentLike(role)) return scrubDocuments(quote, role);
  const hideAgentMarkup = role === "customer";
  const clone = stripSensitive(JSON.parse(JSON.stringify(quote)), hideAgentMarkup) as Record<string, unknown>;
  delete clone.internalNotes;
  delete clone.totalNetCost;
  delete clone.grossProfit;
  delete clone.profitMargin;
  delete clone.discountType;
  delete clone.discountValue;
  delete clone.discountAmount;
  if (!hideAgentMarkup) {
    if (clone.agentMarkup == null) clone.agentMarkup = 0;
    if (clone.baseSellingTotal == null && clone.total != null) {
      clone.baseSellingTotal = Math.max(0, Number(clone.total) - Number(clone.agentMarkup || 0));
    }
  }
  return scrubDocuments(clone as T, role);
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
  /** When true, also create per-user alerts for agency admin / ops / branch managers. */
  notifyOpsRoles?: boolean;
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

  if (!opts.notifyOpsRoles || !opts.agencyId) return;

  const opsUsers = await db.user.findMany({
    where: {
      agencyId: opts.agencyId,
      status: "Active",
      role: { in: ["agency_admin", "branch_manager", "operations", "super_admin"] },
    },
    select: { id: true },
    take: 40,
  });

  if (!opsUsers.length) return;

  await db.notification.createMany({
    data: opsUsers.map((u) => ({
      type: "internal",
      title: opts.title,
      message: opts.message,
      priority: opts.priority || "high",
      agencyId: opts.agencyId!,
      userId: u.id,
    })),
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

/** @deprecated Prefer importing from quotation-expiry.js — re-exported for compatibility. */
export { expireDueQuotations, runExpireDueQuotations } from "./quotation-expiry.js";

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
