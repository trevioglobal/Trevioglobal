import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "./db.js";
import { logger } from "./logger.js";
import {
  canTransition,
  normalizeStatus,
  notifyQuote,
  QUOTE_INCLUDE,
  writeQuoteAudit,
} from "./quotations.js";
import { quoteSendBlockReason, type QuoteAccessShape } from "./quote-access.js";
import {
  isPastValidTill,
  quotePastValidityBlockReason,
  runExpireDueQuotations,
} from "./quotation-expiry.js";

export type CustomerResponseType = "Accept" | "Reject" | "RevisionRequested";

export class CustomerAccessError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = "CustomerAccessError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const RESPONSE_ELIGIBLE = new Set([
  "Sent to Agent",
  "Sent",
  "Customer Reviewing",
]);

/** Statuses from which Accept is allowed (incl. idempotent re-accept). */
const ACCEPT_FROM = new Set([...RESPONSE_ELIGIBLE, "Accepted"]);

export function hashCustomerToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateCustomerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** End of UTC calendar day for validTill, or null if unparseable. */
export function accessExpiresAtFromValidTill(validTill: string | null | undefined): Date | null {
  if (!validTill || !/^\d{4}-\d{2}-\d{2}/.test(validTill.trim())) return null;
  const day = validTill.trim().slice(0, 10);
  return new Date(`${day}T23:59:59.999Z`);
}

export function quoteCustomerResponseBlockReason(
  quote: QuoteAccessShape & { validTill?: string | null; currentVersion?: number | null },
  now: Date = new Date(),
): string | null {
  const status = normalizeStatus(quote.status || "");
  if (status === "Converted to Booking") return "This quotation has already been converted to a booking.";
  if (status === "Archived") return "This quotation is archived.";
  if (status === "Rejected") return "This quotation was rejected.";
  if (status === "Expired" || quotePastValidityBlockReason(quote, now)) {
    return "This quotation has expired.";
  }
  if (status === "Draft" || status === "In Progress" || status === "Pending Approval") {
    return "This quotation is not yet available for customer response.";
  }
  if (status === "Revision Requested") {
    return "A revision has already been requested. Please wait for an updated quotation.";
  }
  return null;
}

function customerSafePackage(pkg: Record<string, unknown>) {
  const pricing = (pkg.pricing && typeof pkg.pricing === "object" ? pkg.pricing : {}) as Record<string, unknown>;
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    isSelected: pkg.isSelected,
    hotels: sanitizeLineArray(pkg.hotels),
    flights: sanitizeLineArray(pkg.flights),
    transfers: sanitizeLineArray(pkg.transfers),
    activities: sanitizeLineArray(pkg.activities),
    meals: sanitizeLineArray(pkg.meals),
    itinerary: sanitizeLineArray(pkg.itinerary),
    visa: sanitizeLineValue(pkg.visa),
    insurance: sanitizeLineValue(pkg.insurance),
    inclusions: pkg.inclusions ?? [],
    exclusions: pkg.exclusions ?? [],
    total: Number(pkg.total ?? pricing.finalPrice ?? pricing.customerPrice ?? 0),
    gst: Number(pkg.gst ?? pricing.taxAmount ?? 0),
    perPersonCost: Number(pkg.perPersonCost ?? pricing.perAdultPrice ?? 0),
    pricing: {
      finalPrice: Number(pricing.finalPrice ?? pkg.total ?? 0),
      customerPrice: Number(pricing.customerPrice ?? pricing.finalPrice ?? pkg.total ?? 0),
      taxAmount: pricing.taxAmount != null ? Number(pricing.taxAmount) : null,
      taxRate: pricing.taxRate != null ? Number(pricing.taxRate) : null,
      currency: pricing.currency != null ? String(pricing.currency) : undefined,
      perAdultPrice: pricing.perAdultPrice != null ? Number(pricing.perAdultPrice) : undefined,
      perChildPrice: pricing.perChildPrice != null ? Number(pricing.perChildPrice) : undefined,
    },
  };
}

const INTERNAL_KEYS = new Set([
  "costPrice", "quotedCostPrice", "contractedCost", "supplierCost", "trevioMarkup",
  "trevioMarkupType", "trevioMarkupValue", "trevioMarkupAmount", "supplier", "supplierId",
  "supplierRef", "supplierName", "totalNetCost", "grossProfit", "profitMargin",
  "internalNotes", "internalRemarks", "remarks", "discountType", "discountValue",
  "discountAmount", "agentMarkup", "baseSellingTotal", "markup", "approverName",
  "approverRole", "comments",
]);

function sanitizeLineValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeLineValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (INTERNAL_KEYS.has(k)) continue;
    out[k] = sanitizeLineValue(v);
  }
  return out;
}

function sanitizeLineArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => sanitizeLineValue(row));
}

export function buildCustomerSafeQuotationView(
  quote: Record<string, unknown>,
  opts: { versionNumber: number; canRespond: boolean; responseBlockedReason?: string | null },
) {
  const packages = Array.isArray(quote.packages)
    ? (quote.packages as Record<string, unknown>[]).map(customerSafePackage)
    : [];
  return {
    quoteNo: quote.quoteNo,
    customerName: quote.customerName,
    destination: quote.destination,
    country: quote.country,
    travelDates: quote.travelDates,
    travelStartDate: quote.travelStartDate,
    travelEndDate: quote.travelEndDate,
    nights: quote.nights,
    days: quote.days,
    adults: quote.adults,
    children: quote.children,
    infants: quote.infants,
    currency: quote.currency || "INR",
    amount: quote.amount,
    gst: quote.gst,
    total: quote.total,
    validTill: quote.validTill,
    status: normalizeStatus(String(quote.status || "")),
    specialRequests: quote.specialRequests,
    termsAndConditions: quote.termsAndConditions,
    paymentTerms: quote.paymentTerms,
    cancellationPolicy: quote.cancellationPolicy,
    refundPolicy: quote.refundPolicy,
    hotelTerms: quote.hotelTerms,
    flightTerms: quote.flightTerms,
    visaTerms: quote.visaTerms,
    insuranceTerms: quote.insuranceTerms,
    forceMajeure: quote.forceMajeure,
    travelDisclaimer: quote.travelDisclaimer,
    coverImage: quote.coverImage,
    packageIncludes: quote.packageIncludes,
    packageExcludes: quote.packageExcludes,
    versionNumber: opts.versionNumber,
    currentVersion: Number(quote.currentVersion || opts.versionNumber),
    canRespond: opts.canRespond,
    responseBlockedReason: opts.responseBlockedReason || null,
    packages,
  };
}

export async function createCustomerAccessLink(opts: {
  quotationId: string;
  createdById?: string;
  createdByName?: string;
  appOrigin?: string;
}): Promise<{ rawToken: string; accessId: string; versionNumber: number; expiresAt: Date | null; url: string | null }> {
  const quote = await db.quotation.findFirst({
    where: { id: opts.quotationId, deletedAt: null },
    include: { approvals: true },
  });
  if (!quote) throw new CustomerAccessError("Quotation not found", 404);

  const sendBlocked = quoteSendBlockReason(quote);
  if (sendBlocked) throw new CustomerAccessError(sendBlocked, 403, "NOT_SENDABLE");
  if (quotePastValidityBlockReason(quote)) throw new CustomerAccessError("This quotation has expired.", 400, "EXPIRED");

  const versionNumber = quote.currentVersion || 1;
  const rawToken = generateCustomerToken();
  const tokenHash = hashCustomerToken(rawToken);
  const expiresAt = accessExpiresAtFromValidTill(quote.validTill);

  const access = await db.quotationCustomerAccess.create({
    data: {
      quotationId: quote.id,
      tokenHash,
      versionNumber,
      expiresAt: expiresAt ?? undefined,
      createdById: opts.createdById,
      createdByName: opts.createdByName,
    },
  });

  const origin = resolveAppOrigin(opts.appOrigin);
  const url = origin ? `${origin}/q/${rawToken}` : null;

  return { rawToken, accessId: access.id, versionNumber, expiresAt, url };
}

export async function revokeCustomerAccessForQuotation(quotationId: string): Promise<number> {
  const result = await db.quotationCustomerAccess.updateMany({
    where: { quotationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

async function loadAccessContext(rawToken: string) {
  if (!rawToken || rawToken.length < 20) {
    throw new CustomerAccessError("Invalid access link", 404, "INVALID_TOKEN");
  }
  const tokenHash = hashCustomerToken(rawToken);
  const access = await db.quotationCustomerAccess.findUnique({ where: { tokenHash } });
  if (!access || access.revokedAt) {
    throw new CustomerAccessError("Invalid or revoked access link", 404, "INVALID_TOKEN");
  }
  if (access.expiresAt && access.expiresAt.getTime() < Date.now()) {
    throw new CustomerAccessError("This access link has expired", 410, "LINK_EXPIRED");
  }

  const quote = await db.quotation.findFirst({
    where: { id: access.quotationId, deletedAt: null },
    include: QUOTE_INCLUDE,
  });
  if (!quote) throw new CustomerAccessError("Quotation not found", 404);

  await db.quotationCustomerAccess.update({
    where: { id: access.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => undefined);

  return { access, quote };
}

async function ensureNotOperationallyExpired(quote: {
  id: string;
  status: string;
  validTill: string;
}) {
  const now = new Date();
  if (quote.status === "Expired") {
    throw new CustomerAccessError("This quotation has expired.", 400, "EXPIRED");
  }
  if (isPastValidTill(quote.validTill, now)) {
    try {
      await runExpireDueQuotations({ agencyWhere: { id: quote.id }, now });
    } catch (err) {
      logger.warn({ err, quotationId: quote.id }, "eager expiry during customer response failed");
    }
    throw new CustomerAccessError("This quotation has expired.", 400, "EXPIRED");
  }
}

export async function getCustomerQuotationByToken(rawToken: string) {
  const { access, quote } = await loadAccessContext(rawToken);
  const status = normalizeStatus(quote.status);
  const versionMatches = access.versionNumber === (quote.currentVersion || 1);
  let responseBlockedReason: string | null = null;

  if (!versionMatches) {
    responseBlockedReason = "A newer version of this quotation is available. Ask your advisor for an updated link.";
  } else {
    responseBlockedReason = quoteCustomerResponseBlockReason(quote);
    if (!responseBlockedReason && !RESPONSE_ELIGIBLE.has(status) && status !== "Accepted") {
      responseBlockedReason = `This quotation cannot accept a response in status ${status}.`;
    }
  }

  if (versionMatches && status === "Sent to Agent" && !responseBlockedReason) {
    await db.quotation.update({
      where: { id: quote.id },
      data: { status: "Customer Reviewing" },
    });
    (quote as { status: string }).status = "Customer Reviewing";
  }

  const liveStatus = normalizeStatus(quote.status);
  const view = buildCustomerSafeQuotationView(quote as unknown as Record<string, unknown>, {
    versionNumber: access.versionNumber,
    canRespond: !responseBlockedReason && versionMatches && RESPONSE_ELIGIBLE.has(liveStatus),
    responseBlockedReason,
  });

  if (versionMatches && liveStatus === "Accepted") {
    view.canRespond = false;
    view.responseBlockedReason = view.responseBlockedReason || "You have already accepted this quotation.";
  }

  return {
    quotation: view,
    access: {
      versionNumber: access.versionNumber,
      expiresAt: access.expiresAt,
    },
  };
}

export async function submitCustomerResponse(opts: {
  rawToken: string;
  responseType: CustomerResponseType;
  comment?: string;
  customerName?: string;
  customerEmail?: string;
  selectedPackageId?: string;
  personName?: string;
}) {
  const { access, quote } = await loadAccessContext(opts.rawToken);
  await ensureNotOperationallyExpired(quote);

  const currentVersion = quote.currentVersion || 1;
  if (access.versionNumber !== currentVersion) {
    throw new CustomerAccessError(
      "This link is for a previous version. Request an updated quotation link from your advisor.",
      409,
      "VERSION_MISMATCH",
    );
  }

  const status = normalizeStatus(quote.status);

  if (opts.responseType === "Accept" && status === "Accepted" && quote.acceptedVersionNumber === currentVersion) {
    const latest = await db.quotationCustomerResponse.findFirst({
      where: { quotationId: quote.id, versionNumber: currentVersion, responseType: "Accept" },
      orderBy: { createdAt: "desc" },
    });
    return {
      idempotent: true,
      response: latest,
      quotation: buildCustomerSafeQuotationView(quote as unknown as Record<string, unknown>, {
        versionNumber: currentVersion,
        canRespond: false,
        responseBlockedReason: "You have already accepted this quotation.",
      }),
    };
  }

  const block = quoteCustomerResponseBlockReason(quote);
  if (block) {
    throw new CustomerAccessError(block, 400);
  }

  const targetStatus =
    opts.responseType === "Accept" ? "Accepted"
      : opts.responseType === "Reject" ? "Rejected"
        : "Revision Requested";

  if (!ACCEPT_FROM.has(status) && opts.responseType === "Accept") {
    throw new CustomerAccessError(`Cannot accept a quotation in status ${status}.`, 409, "INVALID_TRANSITION");
  }
  if (opts.responseType !== "Accept" && !RESPONSE_ELIGIBLE.has(status)) {
    throw new CustomerAccessError(`Cannot respond from status ${status}.`, 409, "INVALID_TRANSITION");
  }
  if (!canTransition(status, targetStatus) && !(opts.responseType === "Accept" && status === "Accepted")) {
    throw new CustomerAccessError(`Invalid transition ${status} → ${targetStatus}`, 409, "INVALID_TRANSITION");
  }

  if (status !== "Accepted") {
    const approvalBlock = quoteSendBlockReason(quote);
    if (approvalBlock) throw new CustomerAccessError(approvalBlock, 403, "APPROVAL_REQUIRED");
  }

  if (opts.selectedPackageId) {
    const belongs = (quote.packages || []).some((p) => p.id === opts.selectedPackageId);
    if (!belongs) throw new CustomerAccessError("Selected package is not part of this quotation", 400);
    await db.quotationPackage.updateMany({ where: { quotationId: quote.id }, data: { isSelected: false } });
    await db.quotationPackage.updateMany({
      where: { id: opts.selectedPackageId, quotationId: quote.id },
      data: { isSelected: true },
    });
  }

  const response = await db.quotationCustomerResponse.create({
    data: {
      quotationId: quote.id,
      accessId: access.id,
      versionNumber: currentVersion,
      responseType: opts.responseType,
      comment: opts.comment?.slice(0, 4000) || undefined,
      customerName: (opts.personName || opts.customerName || quote.customerName || "").slice(0, 200) || undefined,
      customerEmail: opts.customerEmail?.slice(0, 200) || quote.contactEmail || undefined,
      selectedPackageId: opts.selectedPackageId || undefined,
    },
  });

  const data: Record<string, unknown> = { status: targetStatus };
  if (opts.responseType === "Accept") {
    data.acceptedAt = new Date();
    data.acceptedByName = opts.personName || opts.customerName || quote.customerName;
    data.acceptedByEmail = opts.customerEmail || quote.contactEmail;
    data.acceptedVersionNumber = currentVersion;
    data.selectedPackageId = opts.selectedPackageId || quote.selectedPackageId;
  }
  if (opts.responseType === "Reject") {
    data.rejectedReason = opts.comment || "Rejected by customer";
  }
  if (opts.responseType === "RevisionRequested") {
    await db.quotationRevision.create({
      data: {
        quotationId: quote.id,
        requestedBy: opts.personName || opts.customerName || quote.customerName || "Customer",
        requestedByRole: "customer",
        comments: opts.comment,
        requestedChanges: opts.comment,
      },
    });
  }

  const updated = await db.quotation.update({
    where: { id: quote.id },
    data,
    include: QUOTE_INCLUDE,
  });

  await writeQuoteAudit({
    agencyId: quote.agencyId,
    quotationId: quote.id,
    action: `Customer ${opts.responseType}`,
    details: `v${currentVersion}`,
    updatedValue: {
      responseType: opts.responseType,
      versionNumber: currentVersion,
      responseId: response.id,
    },
  });

  await notifyQuote({
    agencyId: quote.agencyId,
    title: `Customer ${opts.responseType === "RevisionRequested" ? "requested revision" : `${opts.responseType.toLowerCase()}ed`}`,
    message: `${quote.quoteNo} v${currentVersion}: ${opts.responseType}${opts.comment ? ` — ${opts.comment.slice(0, 120)}` : ""}${
      opts.responseType === "Accept"
        ? " — Ops / agency admin: proceed to booking and arrange hotels, flights & transfers."
        : ""
    }`,
    priority: "high",
    notifyOpsRoles: opts.responseType === "Accept" || opts.responseType === "RevisionRequested",
  });

  return {
    idempotent: false,
    response,
    quotation: buildCustomerSafeQuotationView(updated as unknown as Record<string, unknown>, {
      versionNumber: currentVersion,
      canRespond: false,
      responseBlockedReason: `Response recorded: ${opts.responseType}`,
    }),
  };
}

/** Conversion gate: acceptance must be for the live currentVersion. */
export function quoteAcceptedVersionBlockReason(quote: {
  status?: string | null;
  currentVersion?: number | null;
  acceptedVersionNumber?: number | null;
}): string | null {
  if (normalizeStatus(quote.status || "") !== "Accepted") return null;
  const current = quote.currentVersion ?? 1;
  if (quote.acceptedVersionNumber == null) {
    return "Acceptance is not bound to a quotation version. Ask the customer to accept again via a secure link.";
  }
  if (quote.acceptedVersionNumber !== current) {
    return `Acceptance was for version ${quote.acceptedVersionNumber}; current version is ${current}. Send the new version for customer acceptance.`;
  }
  return null;
}

/** Clear acceptance binding when a material revision invalidates prior approval. */
export async function clearAcceptanceAfterMaterialChange(quotationId: string): Promise<void> {
  await db.quotation.updateMany({
    where: { id: quotationId },
    data: {
      acceptedVersionNumber: null,
      acceptedAt: null,
      acceptedByName: null,
      acceptedByEmail: null,
    },
  });
  await revokeCustomerAccessForQuotation(quotationId);
}

/** Assert customer payload never includes internal keys (tests). */
export function assertCustomerSafePayload(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  const hits: string[] = [];
  for (const key of [
    "contractedCost", "supplierCost", "trevioMarkup", "agentMarkup", "totalNetCost",
    "grossProfit", "internalNotes", "approverName", "tokenHash",
  ]) {
    if (text.includes(`"${key}"`)) hits.push(key);
  }
  return hits;
}

export function resolveAppOrigin(input?: string | null): string {
  const fromInput = (input || "").trim().replace(/\/+$/, "");
  if (fromInput && /^https?:\/\//i.test(fromInput)) return fromInput;
  const fromEnv = (process.env.PUBLIC_APP_ORIGIN || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const cors = (process.env.CORS_ORIGIN || "").split(",")[0]?.trim().replace(/\/+$/, "");
  if (cors && /^https?:\/\//i.test(cors)) return cors;
  return "";
}

export { RESPONSE_ELIGIBLE, ACCEPT_FROM };
