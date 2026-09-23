import type { Express, Response } from "express";
import { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import {
  QUOTE_INCLUDE,
  buildTermsSnapshot,
  calcPackageCosting,
  canTransition,
  discountApprovalBlockReason,
  isAgentLike,
  latestApprovalStage,
  nextDiscountApprovalAction,
  nextQuoteNo,
  nightsBetween,
  normalizeStatus,
  notifyQuote,
  expireDueQuotations,
  quoteStaffAcceptTransitionBlockReason,
  restorePackagesFromSnapshot,
  sanitizeQuotationForRole,
  writeQuoteAudit,
} from "../lib/quotations.js";
import { agentQuoteScope, canApproveStage, quoteSendBlockReason } from "../lib/quote-access.js";
import { freshValidTill, isPastValidTill, quotePastValidityBlockReason, runExpireDueQuotations } from "../lib/quotation-expiry.js";
import { defaultValidTill, todayYmd, travelDatesBlockReason, travelDatesUpdateBlockReason } from "../lib/travel-dates.js";
import {
  createQuotationVersion,
  ensureInitialQuotationVersion,
  recordQuotationRevisionIfNeeded,
  sanitizeVersionSnapshot,
  snapshotVersion,
  summarizeVersionForList,
} from "../lib/quotation-versions.js";
import {
  normalizeTripCities,
  tripCitiesDestinationLabel,
  tripCitiesTotalNights,
} from "../lib/quote-trip-cities.js";
import { generateQuotationPdf, QuotationPdfError } from "../lib/quotation-pdf/index.js";
import { publicErrorMessage } from "../lib/http-error.js";
import { resolveDefaultAgencyId } from "../lib/api-key-config.js";
import { TAX_CONFIGURATION_REQUIRED, pricePackage, pricingBlockReason, ruleApplies, stripAgentPricingOverrides, type TaxRuleInput } from "../lib/pricing.js";
import { validateMalaysiaTransferLines } from "../lib/malaysia-transfer-rules.js";
import {
  NO_VALID_RATE_MESSAGE,
  RATE_SOURCES,
  applyResolvedSnapshot,
  applyUnresolvedLine,
  buildRateSnapshot,
  catalogDisplayPrice,
  freezePackageLines,
  getApplicableContractedRate,
  isIsoDate,
  isProductType,
  loadOwnedProduct,
  quoteUnresolvedRateReason,
  rateVariantKey,
} from "../lib/contracted-rates.js";
import { deliverQuotation, QuotationDeliveryError } from "../lib/quotation-delivery/index.js";
import { verifyDeliveryMediaToken } from "../lib/quotation-delivery/whatsapp-provider.js";
import {
  createCustomerAccessLink,
  resolveAppOrigin,
} from "../lib/quotation-customer-access.js";
import { readPrivateObject } from "../lib/document-storage.js";
import {
  buildQuotationPackageFromTravelPackage,
  loadPublishedPackage,
} from "../lib/package-to-quotation.js";
import { extractTemplateContent, mergeTemplateIntoQuotation, type MergeMode } from "../lib/quote-template-merge.js";

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;

/**
 * Contracted-rate freeze must resolve shared catalogue rates (agencyId null),
 * matching catalogAgencyScope used by /api/contracted-rates and /api/products.
 */
function catalogRateScope(req: AuthRequest, agencyScope: ScopeFn): Record<string, unknown> {
  const scope = agencyScope(req);
  if (!Object.prototype.hasOwnProperty.call(scope, "agencyId")) return scope;
  return { OR: [{ agencyId: scope.agencyId }, { agencyId: null }] };
}
type OwnAgencyFn = (req: AuthRequest, fallback?: string) => string | undefined;
type OwnBranchFn = (req: AuthRequest) => string | undefined;
type BranchScopeFn = (req: AuthRequest, ownField?: string) => Record<string, unknown>;

function pricingFinalizationBlock(packages: Array<{ pricing?: unknown }> | undefined): string | null {
  if (!packages?.length) return TAX_CONFIGURATION_REQUIRED;
  for (const pkg of packages) {
    const pricing = pkg.pricing as { unresolved?: boolean; reasons?: string[]; taxRequired?: boolean } | null;
    if (!pricing || pricing.unresolved || pricing.taxRequired) return pricingBlockReason(pricing || { taxRequired: true });
  }
  return null;
}

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : String(id ?? "");
}

function parsePagination(req: AuthRequest) {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "undefined" || s === "null") return null;
  return s;
}

/** Coerce unknown body fields to a non-empty string (Record<string, unknown> safe). */
function asStr(value: unknown, fallback = ""): string {
  return emptyToNull(value) ?? fallback;
}

function asNumOrUndef(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asBoolOrUndef(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  return Boolean(value);
}

function jsonValue(value: unknown, fallback: Prisma.InputJsonValue = []): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback)) as Prisma.InputJsonValue;
  } catch {
    return fallback;
  }
}

function packageHasPricedLines(pkg: Record<string, unknown>): boolean {
  const keys = ["hotels", "flights", "transfers", "activities", "meals"] as const;
  return keys.some((k) => Array.isArray(pkg[k]) && (pkg[k] as unknown[]).some((line) => {
    if (!line || typeof line !== "object") return false;
    const r = line as Record<string, unknown>;
    return Boolean(r.productId) || toInt(r.sellingPrice, 0) > 0 || toInt(r.costPrice, 0) > 0;
  }));
}

async function existingUserId(id?: string | null): Promise<string | null> {
  const uid = emptyToNull(id);
  if (!uid) return null;
  const row = await db.user.findUnique({ where: { id: uid }, select: { id: true } });
  return row?.id ?? null;
}

async function resolveQuoteAgentCodes(opts: {
  req: AuthRequest;
  body: Record<string, unknown>;
  agencyId?: string | null;
}): Promise<{ agencyCode: string | null; agentCode: string | null; agentId: string | null; agentName: string | null }> {
  const { ensureAgencyCode, ensureUserAgentCode } = await import("../lib/agent-codes.js");
  let agencyCode = emptyToNull(opts.body.agencyCode);
  let agentCode = emptyToNull(opts.body.agentCode);
  let agentId = emptyToNull(opts.body.agentId);
  let agentName = emptyToNull(opts.body.agentName);

  if (opts.agencyId) {
    try {
      agencyCode = (await ensureAgencyCode(opts.agencyId)) || agencyCode;
    } catch {
      /* non-fatal */
    }
  }

  if (!agentId && opts.req.auth?.role === "travel_agent") {
    agentId = emptyToNull(opts.req.auth.userId);
  }
  if (!agentId && agentName && opts.agencyId) {
    const match = await db.user.findFirst({
      where: {
        agencyId: opts.agencyId,
        OR: [
          { name: { equals: agentName, mode: "insensitive" } },
          { email: { equals: agentName, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
    });
    if (match) {
      agentId = match.id;
      agentName = match.name;
    }
  }
  // Default quote owner to the logged-in staff member when no travel agent was picked.
  if (!agentId) agentId = emptyToNull(opts.req.auth?.userId);

  if (agentId) {
    try {
      agentCode = (await ensureUserAgentCode(agentId, true)) || agentCode;
      const agent = await db.user.findUnique({
        where: { id: agentId },
        select: { name: true, agentCode: true, agencyId: true },
      });
      if (agent) {
        agentName = agent.name || agentName;
        agentCode = agent.agentCode || agentCode;
        if (!agencyCode && agent.agencyId) {
          agencyCode = (await ensureAgencyCode(agent.agencyId)) || agencyCode;
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  // Never allocate an orphan code that is not stored on a user.
  return { agencyCode, agentCode, agentId, agentName };
}

function packageWriteData(
  pkg: Record<string, unknown>,
  costing: ReturnType<typeof calcPackageCosting>,
) {
  return {
    name: String(pkg.name || "Package"),
    sortOrder: toInt(pkg.sortOrder, 0),
    isSelected: Boolean(pkg.isSelected),
    description: pkg.description != null ? String(pkg.description) : undefined,
    hotels: jsonValue(pkg.hotels, []),
    flights: jsonValue(pkg.flights, []),
    transfers: jsonValue(pkg.transfers, []),
    activities: jsonValue(pkg.activities, []),
    meals: jsonValue(pkg.meals, []),
    itinerary: jsonValue(pkg.itinerary, []),
    visa: pkg.visa != null ? jsonValue(pkg.visa, {}) : undefined,
    insurance: pkg.insurance != null ? jsonValue(pkg.insurance, {}) : undefined,
    addOns: jsonValue(pkg.addOns, []),
    inclusions: jsonValue(pkg.inclusions, []),
    exclusions: jsonValue(pkg.exclusions, []),
    totalNetCost: toInt(costing.totalNetCost, 0),
    totalSelling: toInt(costing.totalSelling, 0),
    grossProfit: toInt(costing.grossProfit, 0),
    gst: toInt(costing.gst, 0),
    total: toInt(costing.total, 0),
    perPersonCost: toInt(costing.perPersonCost, 0),
    pricing: pkg.pricing != null ? jsonValue(pkg.pricing, {}) : undefined,
  };
}

async function applyDiscountApproval(opts: {
  quotationId: string;
  role?: string;
  email?: string;
  discountType?: string | null;
  discountValue?: number | null;
  approvals?: Array<{ stage?: string | null; status?: string | null }> | null;
  discountChanged?: boolean;
}) {
  const decision = nextDiscountApprovalAction({
    role: opts.role,
    discountType: opts.discountType,
    discountValue: opts.discountValue,
    latestDiscountStatus: latestApprovalStage(opts.approvals, "Discount")?.status,
    discountChanged: opts.discountChanged,
  });
  if (decision.action !== "create") return null;
  return db.quotationApproval.create({
    data: {
      quotationId: opts.quotationId,
      stage: "Discount",
      status: decision.status,
      comments: decision.comments,
      ...(decision.status === "Approved"
        ? {
            approverName: opts.email,
            approverRole: opts.role,
            decidedAt: new Date(),
          }
        : {}),
    },
  });
}

async function loadActiveTaxRule(scope: Record<string, unknown>, asOf?: string | null): Promise<TaxRuleInput | null> {
  const rules = await db.taxRule.findMany({ where: { active: true, ...scope }, orderBy: { createdAt: "desc" } });
  const match = rules.find((rule) => ruleApplies({
    id: rule.id,
    name: rule.name,
    rate: rule.rate,
    method: rule.method === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE",
    active: rule.active,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
  }, asOf));
  if (!match) return null;
  return {
    id: match.id,
    name: match.name,
    rate: match.rate,
    method: match.method === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE",
    active: true,
    effectiveFrom: match.effectiveFrom,
    effectiveTo: match.effectiveTo,
  };
}

function layersFromPackage(priced: ReturnType<typeof pricePackage>) {
  const profit = priced.trevioSellingPrice - priced.contractedCost;
  return {
    totalNetCost: priced.contractedCost,
    totalSelling: priced.trevioSellingPrice,
    grossProfit: profit,
    profitMargin: priced.trevioSellingPrice > 0 ? Math.round((profit / priced.trevioSellingPrice) * 10000) / 100 : 0,
    discountAmount: priced.discountAmount,
    taxableAmount: priced.customerPrice,
    gst: priced.taxAmount ?? 0,
    total: priced.finalPrice ?? priced.customerPrice,
    perPersonCost: priced.perAdultPrice,
    amount: priced.customerPrice,
  };
}

/** YYYY-MM-DD or null. */
function optionalDateString(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T12:00:00`);
  if (Number.isNaN(t)) return null;
  return s;
}

function resolveTripBasicsFromBody(body: Record<string, unknown>, existing?: {
  destination?: string | null;
  nights?: number | null;
  days?: number | null;
  travelStartDate?: string | null;
  travelEndDate?: string | null;
}) {
  const tripCities = body.tripCities !== undefined
    ? normalizeTripCities(body.tripCities)
    : undefined;
  const cityNights = tripCities ? tripCitiesTotalNights(tripCities) : 0;
  const computedNights = nightsBetween(
    (body.travelStartDate as string) ?? existing?.travelStartDate,
    (body.travelEndDate as string) ?? existing?.travelEndDate,
  );
  let nights = computedNights;
  if (tripCities && tripCities.length > 0 && cityNights > 0) {
    nights = cityNights;
  } else if (nights == null && body.nights != null && Number.isFinite(Number(body.nights))) {
    nights = toInt(body.nights, 0);
  } else if (nights == null && existing?.nights != null) {
    nights = existing.nights;
  }

  let destination = body.destination !== undefined
    ? emptyToNull(body.destination)
    : existing?.destination ?? null;
  // When Trip Plan City Wise is provided, keep list destination in sync (do not invent cities for legacy []).
  if (tripCities && tripCities.length > 0) {
    destination = tripCitiesDestinationLabel(tripCities) || destination;
  }

  return {
    tripCities,
    nights: nights ?? null,
    days: nights != null ? nights + 1 : (body.days != null && Number.isFinite(Number(body.days)) ? toInt(body.days) : existing?.days ?? null),
    destination,
  };
}

async function priceFrozenPackage(
  frozen: Record<string, unknown>,
  input: {
    currency?: string | null;
    nights?: number | null;
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
    trevioMarkupType?: string | null;
    trevioMarkupValue?: number | null;
    agentMarkupType?: string | null;
    agentMarkup?: number | null;
    discountType?: string | null;
    discountValue?: number | null;
    travelStartDate?: string | null;
    exchangeRate?: number | null;
    exchangeRateExplicit?: boolean | null;
    scope: Record<string, unknown>;
    allowClientTax?: boolean;
  },
) {
  const quotePax = Math.max(1, Number(input.adults ?? 0) + Number(input.children ?? 0));
  const transferRuleError = validateMalaysiaTransferLines(frozen.transfers, quotePax);
  if (transferRuleError) {
    const err = new Error(transferRuleError) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  const taxRule = await loadActiveTaxRule(input.scope, input.travelStartDate);
  const priced = pricePackage(frozen, {
    currency: input.currency || "INR",
    nights: input.nights,
    adults: Number(input.adults ?? 0),
    children: Number(input.children ?? 0),
    infants: Number(input.infants ?? 0),
    trevioMarkup: {
      type: input.trevioMarkupType === "Fixed" ? "Fixed" : "Percentage",
      value: Number(input.trevioMarkupValue ?? 0),
    },
    agentMarkup: {
      type: input.agentMarkupType === "Percentage" ? "Percentage" : "Fixed",
      value: Number(input.agentMarkup ?? 0),
    },
    discountType: input.discountType,
    discountValue: Number(input.discountValue ?? 0),
    taxRule,
    asOfDate: input.travelStartDate,
    exchangeRate: input.exchangeRate,
    exchangeRateExplicit: Boolean(input.exchangeRateExplicit),
  });
  return {
    frozen: { ...frozen, ...priced.lines, pricing: priced } as Record<string, unknown>,
    priced,
    taxRuleId: taxRule?.id ?? null,
    taxRate: taxRule?.rate ?? 0,
  };
}

async function loadQuote(req: AuthRequest, agencyScope: ScopeFn, branchScope: BranchScopeFn) {
  return db.quotation.findFirst({
    where: {
      id: paramId(req),
      deletedAt: null,
      ...agencyScope(req),
      ...branchScope(req, "createdById"),
    },
    include: QUOTE_INCLUDE,
  });
}

async function loadQuoteForActor(req: AuthRequest, agencyScope: ScopeFn, branchScope: BranchScopeFn) {
  if (isAgentLike(req.auth?.role)) return loadAgentQuote(req, agencyScope);
  return loadQuote(req, agencyScope, branchScope);
}

async function loadAgentQuote(req: AuthRequest, agencyScope: ScopeFn) {
  return db.quotation.findFirst({
    where: {
      id: paramId(req),
      deletedAt: null,
      ...agencyScope(req),
      OR: [{ createdById: req.auth?.userId }, { agentId: req.auth?.userId }],
    },
    include: QUOTE_INCLUDE,
  });
}

function agentProductType(line: Record<string, unknown>) {
  if (isProductType(line.productType)) return line.productType;
  const type = String(line.type || "");
  if (/hotel/i.test(type)) return "HOTEL" as const;
  if (/transfer/i.test(type)) return "TRANSFER" as const;
  if (/activit|attraction/i.test(type)) return "ACTIVITY" as const;
  if (/meal/i.test(type)) return "MEAL" as const;
  if (/flight/i.test(type)) return "FLIGHT" as const;
  return null;
}

function collectionFor(type: string) {
  if (type === "HOTEL") return "hotels" as const;
  if (type === "TRANSFER") return "transfers" as const;
  if (type === "ACTIVITY") return "activities" as const;
  if (type === "MEAL") return "meals" as const;
  return "flights" as const;
}

async function prepareAgentTripLines(
  lines: Array<Record<string, unknown>>,
  options: { travelDate?: string | null; scope: Record<string, unknown> },
) {
  const lineItems: Array<{ id: string; type: string; description: string; qty: number; price: number; amount: number }> = [];
  const packages = {
    hotels: [] as Record<string, unknown>[],
    flights: [] as Record<string, unknown>[],
    transfers: [] as Record<string, unknown>[],
    activities: [] as Record<string, unknown>[],
    meals: [] as Record<string, unknown>[],
  };
  for (let i = 0; i < lines.length; i += 1) {
    const raw = { ...lines[i] };
    delete raw.contractedCost;
    delete raw.costPrice;
    delete raw.supplier;
    delete raw.supplierId;
    const qty = Math.max(1, Number(raw.qty || 1));
    const productType = raw.productId ? agentProductType(raw) : null;
    if (raw.productId && productType) {
      const travelDate = [raw.checkIn, raw.date, options.travelDate].find((value) => isIsoDate(value));
      if (!travelDate) return { error: NO_VALID_RATE_MESSAGE };
      const result = await getApplicableContractedRate({
        productType,
        productId: String(raw.productId),
        travelDate: String(travelDate),
        scope: options.scope,
        variantKey: rateVariantKey(raw) || undefined,
      });
      if (result.status !== "OK") return { error: result.message };
      const product = await loadOwnedProduct(productType, String(raw.productId), options.scope);
      const display = product ? catalogDisplayPrice(product, productType) : Number(raw.sellingPrice || raw.price || 0);
      const snapshot = buildRateSnapshot({
        productType,
        productId: String(raw.productId),
        rate: result.rate,
        travelDate: String(travelDate),
      });
      const selling = Math.max(0, Math.round(Number(raw.sellingPrice || raw.price || display || 0)));
      const stored = applyResolvedSnapshot({
        ...raw,
        sellingPrice: selling || snapshot.contractedCost,
        hotelName: raw.hotelName || raw.description || product?.name,
        activityName: raw.activityName || raw.description || product?.name,
        airline: raw.airline || product?.airline || raw.description,
      }, snapshot, display);
      packages[collectionFor(productType)].push(stored);
      const price = Number(stored.sellingPrice || 0);
      lineItems.push({
        id: `line-${i + 1}`,
        type: String(raw.type || productType),
        description: String(raw.description || product?.name || productType),
        qty,
        price,
        amount: qty * price,
      });
      continue;
    }
    const price = Math.max(0, Math.round(Number(raw.sellingPrice || raw.price || 0)));
    const source = raw.source === RATE_SOURCES.AMADEUS_API || raw.source === RATE_SOURCES.API
      ? raw.source
      : RATE_SOURCES.MANUAL;
    const manual: Record<string, unknown> = { ...raw, source, sellingPrice: price };
    delete manual.contractedCost;
    delete manual.costPrice;
    delete manual.trevioMarkup;
    delete manual.trevioSellingPrice;
    if ((source === RATE_SOURCES.AMADEUS_API || source === RATE_SOURCES.API) && typeof raw.fare === "number") {
      manual.fare = Math.round(Number(raw.fare));
    }
    const type = agentProductType(raw) || "FLIGHT";
    if (raw.productId) return { error: NO_VALID_RATE_MESSAGE };
    if (/hotel|transfer|activit|meal|flight/i.test(String(raw.type || "")) || source === RATE_SOURCES.AMADEUS_API) {
      packages[collectionFor(agentProductType(raw) || "FLIGHT")].push(manual);
    }
    lineItems.push({
      id: `line-${i + 1}`,
      type: String(raw.type || type),
      description: String(raw.description || raw.type || "Service"),
      qty,
      price,
      amount: qty * price,
    });
  }
  return { lineItems, packages };
}

export function mountQuotationRoutes(
  app: Express,
  agencyScope: ScopeFn,
  ownAgencyId: OwnAgencyFn,
  ownBranchId: OwnBranchFn,
  branchScope: BranchScopeFn,
) {
  // ── List with filters / sort / pagination ────────────────────────────────
  app.get("/api/quotations/manage", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      await expireDueQuotations({ ...agencyScope(req) });
      const { skip, take, page, pageSize } = parsePagination(req);
      const where: Record<string, unknown> = {
        deletedAt: null,
        ...agencyScope(req),
        ...branchScope(req, "createdById"),
      };
      if (req.query.includeArchived !== "true") {
        where.archivedAt = null;
        where.status = { not: "Archived" };
      }
      if (req.query.status && req.query.status !== "All") where.status = String(req.query.status);
      if (req.query.destination) where.destination = { contains: String(req.query.destination), mode: "insensitive" };
      if (req.query.currency) where.currency = String(req.query.currency);
      if (req.query.createdBy) where.createdBy = { contains: String(req.query.createdBy), mode: "insensitive" };
      if (req.query.salesExecutive) {
        where.salesExecutiveName = { contains: String(req.query.salesExecutive), mode: "insensitive" };
      }
      if (req.query.agent) where.agentName = { contains: String(req.query.agent), mode: "insensitive" };
      if (req.query.travelFrom) {
        where.travelStartDate = { gte: String(req.query.travelFrom) };
      }
      if (req.query.travelTo) {
        where.travelEndDate = { lte: String(req.query.travelTo) };
      }
      if (req.query.createdFrom || req.query.createdTo) {
        const createdAt: Record<string, Date> = {};
        if (req.query.createdFrom) createdAt.gte = new Date(String(req.query.createdFrom));
        if (req.query.createdTo) {
          const end = new Date(String(req.query.createdTo));
          end.setHours(23, 59, 59, 999);
          createdAt.lte = end;
        }
        where.createdAt = createdAt;
      }
      if (req.query.q) {
        const q = String(req.query.q);
        where.OR = [
          { quoteNo: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
          { destination: { contains: q, mode: "insensitive" } },
          { agentName: { contains: q, mode: "insensitive" } },
          { salesExecutiveName: { contains: q, mode: "insensitive" } },
          { enquiryRef: { contains: q, mode: "insensitive" } },
        ];
      }

      if (isAgentLike(req.auth?.role)) {
        Object.assign(where, agentQuoteScope(req.auth?.role, req.auth?.userId));
      }

      const sort = String(req.query.sort || "latest");
      const orderBy =
        sort === "oldest" ? { createdAt: "asc" as const } :
        sort === "value" ? { total: "desc" as const } :
        sort === "profit" ? { grossProfit: "desc" as const } :
        sort === "status" ? { status: "asc" as const } :
        sort === "travel" ? { travelStartDate: "asc" as const } :
        { createdAt: "desc" as const };

      const [rows, total] = await Promise.all([
        db.quotation.findMany({ where, orderBy, skip, take, include: { packages: true } }),
        db.quotation.count({ where }),
      ]);

      const role = req.auth?.role;
      const quotations = rows.map((q) => sanitizeQuotationForRole(q as unknown as Record<string, unknown>, role));
      res.json({ quotations, total, page, pageSize });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Dashboard KPIs ───────────────────────────────────────────────────────
  app.get("/api/quotations/analytics", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const where = {
        deletedAt: null,
        ...agencyScope(req),
        ...branchScope(req, "createdById"),
        ...agentQuoteScope(req.auth?.role, req.auth?.userId),
      };
      const rows = await db.quotation.findMany({ where, take: 5000 });
      const byStatus: Record<string, number> = {};
      let totalValue = 0;
      let expectedProfit = 0;
      let acceptedValue = 0;
      let rejectedValue = 0;
      let expiredValue = 0;
      let convertedValue = 0;
      for (const q of rows) {
        const st = normalizeStatus(q.status);
        byStatus[st] = (byStatus[st] || 0) + 1;
        totalValue += q.total || 0;
        if (!isAgentLike(req.auth?.role)) expectedProfit += q.grossProfit || 0;
        if (st === "Accepted" || st === "Converted to Booking") acceptedValue += q.total || 0;
        if (st === "Rejected") rejectedValue += q.total || 0;
        if (st === "Expired") expiredValue += q.total || 0;
        if (st === "Converted to Booking") convertedValue += q.total || 0;
      }
      const sentLike = (byStatus["Sent to Agent"] || 0) + (byStatus["Customer Reviewing"] || 0) + (byStatus.Accepted || 0) + (byStatus["Converted to Booking"] || 0) + (byStatus.Rejected || 0);
      const converted = byStatus["Converted to Booking"] || 0;
      const accepted = (byStatus.Accepted || 0) + converted;
      res.json({
        total: rows.length,
        byStatus,
        draft: byStatus.Draft || 0,
        inProgress: byStatus["In Progress"] || 0,
        pendingApproval: byStatus["Pending Approval"] || 0,
        sent: byStatus["Sent to Agent"] || 0,
        customerReviewing: byStatus["Customer Reviewing"] || 0,
        revisionRequested: byStatus["Revision Requested"] || 0,
        accepted: byStatus.Accepted || 0,
        rejected: byStatus.Rejected || 0,
        expired: byStatus.Expired || 0,
        converted,
        archived: byStatus.Archived || 0,
        totalQuotedValue: totalValue,
        expectedProfit: isAgentLike(req.auth?.role) ? undefined : expectedProfit,
        acceptedValue,
        rejectedValue,
        expiredValue,
        convertedValue,
        conversionRate: sentLike ? Math.round((accepted / sentLike) * 100) : 0,
        averageQuoteValue: rows.length ? Math.round(totalValue / rows.length) : 0,
        averageProfit: !isAgentLike(req.auth?.role) && rows.length ? Math.round(expectedProfit / rows.length) : undefined,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Get one ──────────────────────────────────────────────────────────────
  app.get("/api/quotations/:id/full", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const quote = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!quote) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const payload = sanitizeQuotationForRole(
        quote as unknown as Record<string, unknown>,
        req.auth?.role,
      );
      res.json({ quotation: payload });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Create (wizard / draft) ──────────────────────────────────────────────
  app.post("/api/quotations/wizard", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (req.auth?.role === "customer") {
        res.status(403).json({ error: "Customers cannot create quotations" });
        return;
      }
      const agentActor = req.auth?.role === "travel_agent";
      let body = (req.body || {}) as Record<string, unknown>;
      if (agentActor) {
        body = stripAgentPricingOverrides(body);
        body.agentId = req.auth?.userId;
        body.internalNotes = undefined;
        body.trevioMarkupType = "Percentage";
        body.trevioMarkupValue = 0;
        body.discountType = null;
        body.discountValue = 0;
      }
      let agencyId = ownAgencyId(req, body.agencyId as string | undefined);
      if (!agencyId && req.auth?.role === "super_admin") {
        agencyId = (await resolveDefaultAgencyId()) || undefined;
      }
      const dateBlock = travelDatesBlockReason({
        travelStartDate: body.travelStartDate,
        travelEndDate: body.travelEndDate,
        returnDate: body.returnDate,
        travelDates: body.travelDates,
        validTill: body.validTill || body.quoteExpiryDate,
        estimatedBookingDate: body.estimatedBookingDate,
      });
      if (dateBlock) {
        res.status(400).json({ error: dateBlock });
        return;
      }
      const codes = await resolveQuoteAgentCodes({ req, body, agencyId });
      const agencyCode = codes.agencyCode;
      const agentCode = codes.agentCode;
      const agentId = codes.agentId;
      const agentName = codes.agentName;
      const quoteNo = await nextQuoteNo();
      const tripBasics = resolveTripBasicsFromBody(body);
      const computedNights = nightsBetween(emptyToNull(body.travelStartDate), emptyToNull(body.travelEndDate));
      const nights = tripBasics.nights != null
        ? tripBasics.nights
        : (computedNights != null
          ? computedNights
          : (body.nights != null && Number.isFinite(Number(body.nights)) ? toInt(body.nights, 0) : null));
      const createdById = await existingUserId(req.auth?.userId);
      let leadId = emptyToNull(body.leadId);
      if (leadId) {
        const leadRow = await db.lead.findFirst({ where: { id: leadId, ...agencyScope(req) }, select: { id: true } });
        if (!leadRow) leadId = null;
      }
      const quote = await db.quotation.create({
        data: {
          quoteNo,
          agencyId: agencyId || null,
          branchId: ownBranchId(req) || null,
          customerName: asStr(body.customerName, "Customer"),
          service: asStr(body.service, body.isInternational ? "International" : "Holiday"),
          items: 1,
          amount: 0,
          gst: 0,
          total: 0,
          status: "Draft",
          validTill: asStr(body.validTill || body.quoteExpiryDate, defaultValidTill()),
          quoteDate: todayYmd(),
          createdById,
          createdBy: asStr(body.createdBy || req.auth?.email, "System"),
          contactPerson: emptyToNull(body.contactPerson),
          contactEmail: emptyToNull(body.contactEmail),
          contactPhone: emptyToNull(body.contactPhone),
          destination: tripBasics.destination || emptyToNull(body.destination),
          country: emptyToNull(body.country),
          coverImage: emptyToNull(body.coverImage),
          departureCity: emptyToNull(body.departureCity),
          travelDates: emptyToNull(body.travelStartDate || body.travelDates),
          travelStartDate: emptyToNull(body.travelStartDate),
          travelEndDate: emptyToNull(body.travelEndDate),
          returnDate: emptyToNull(body.travelEndDate || body.returnDate),
          nights,
          days: nights != null ? nights + 1 : (body.days != null && Number.isFinite(Number(body.days)) ? toInt(body.days) : null),
          adults: Math.max(1, toInt(body.adults, 2) || 2),
          children: Math.max(0, toInt(body.children, 0)),
          infants: Math.max(0, toInt(body.infants, 0)),
          rooms: Math.max(1, toInt(body.rooms, 1) || 1),
          hotelStarPreference: emptyToNull(body.hotelStarPreference),
          nationality: emptyToNull(body.nationality),
          landOnly: body.landOnly === true,
          estimatedBookingDate: optionalDateString(body.estimatedBookingDate),
          tripCities: (tripBasics.tripCities ?? []) as unknown as Prisma.InputJsonValue,
          currency: asStr(body.currency, "INR"),
          baseCurrency: asStr(body.baseCurrency || body.currency, "INR"),
          exchangeRate: toFloat(body.exchangeRate, 1) || 1,
          agentName,
          agentId,
          agentCode,
          agencyCode,
          salesExecutiveName: emptyToNull(body.salesExecutiveName) || req.auth?.email,
          salesExecutivePhone: emptyToNull(body.salesExecutivePhone),
          salesExecutiveEmail: emptyToNull(body.salesExecutiveEmail),
          specialRequests: emptyToNull(body.specialRequests),
          internalNotes: emptyToNull(body.internalNotes),
          enquiryRef: emptyToNull(body.enquiryRef) || (leadId ? `LEAD-${leadId.slice(-6)}` : undefined),
          leadId,
          budget: body.budget != null && Number.isFinite(Number(body.budget)) ? toInt(body.budget) : undefined,
          packageIncludes: jsonValue(body.packageIncludes, []),
          packageExcludes: jsonValue(body.packageExcludes, []),
          termsAndConditions: emptyToNull(body.termsAndConditions),
          paymentTerms: emptyToNull(body.paymentTerms),
          cancellationPolicy: emptyToNull(body.cancellationPolicy),
          refundPolicy: emptyToNull(body.refundPolicy),
          taxRate: 0,
          trevioMarkupType: body.trevioMarkupType === "Fixed" ? "Fixed" : "Percentage",
          trevioMarkupValue: toFloat(body.trevioMarkupValue, 0),
          agentMarkupType: body.agentMarkupType === "Percentage" ? "Percentage" : "Fixed",
          agentMarkup: Math.max(0, toInt(body.agentMarkup, 0)),
          exchangeRateExplicit: body.exchangeRateExplicit === true,
          discountType: emptyToNull(body.discountType),
          discountValue: toFloat(body.discountValue, 0),
          wizardStep: Math.max(1, toInt(body.wizardStep, 1) || 1),
          isInternational: Boolean(body.isInternational),
        },
      });

      await applyDiscountApproval({
        quotationId: quote.id,
        role: req.auth?.role,
        email: req.auth?.email,
        discountType: emptyToNull(body.discountType),
        discountValue: toFloat(body.discountValue, 0),
        approvals: [],
      });

      if (leadId) {
        const lead = await db.lead.findFirst({
          where: { id: leadId, ...agencyScope(req) },
        });
        if (lead && !["Won", "Lost", "Quotation Sent"].includes(lead.stage)) {
          await db.lead.update({
            where: { id: lead.id },
            data: { stage: "Quotation Sent" },
          });
        }
      }

      const incomingPackages = Array.isArray(body.packages) ? body.packages as Record<string, unknown>[] : [];
      if (incomingPackages.some(packageHasPricedLines)) {
        try {
          let selectedLayers: ReturnType<typeof layersFromPackage> | null = null;
          let selectedUnresolved = false;
          let selectedTaxRuleId: string | null = null;
          let selectedTaxRate = 0;
          for (const pkg of incomingPackages) {
            const frozen = await freezePackageLines(pkg, {
              travelDate: emptyToNull(body.travelStartDate),
              travelEndDate: emptyToNull(body.travelEndDate),
              scope: catalogRateScope(req, agencyScope),
            });
            const priced = await priceFrozenPackage(frozen, {
              currency: asStr(body.currency, "INR"),
              nights,
              adults: Math.max(1, toInt(body.adults, 2) || 2),
              children: Math.max(0, toInt(body.children, 0)),
              infants: Math.max(0, toInt(body.infants, 0)),
              trevioMarkupType: emptyToNull(body.trevioMarkupType),
              trevioMarkupValue: asNumOrUndef(body.trevioMarkupValue),
              agentMarkupType: emptyToNull(body.agentMarkupType),
              agentMarkup: asNumOrUndef(body.agentMarkup),
              discountType: emptyToNull(body.discountType),
              discountValue: asNumOrUndef(body.discountValue),
              travelStartDate: emptyToNull(body.travelStartDate),
              exchangeRate: asNumOrUndef(body.exchangeRate),
              exchangeRateExplicit: asBoolOrUndef(body.exchangeRateExplicit),
              scope: catalogRateScope(req, agencyScope),
            });
            const layers = layersFromPackage(priced.priced);
            if (pkg.isSelected || !selectedLayers) {
              selectedLayers = layers;
              selectedUnresolved = priced.priced.unresolved;
              selectedTaxRuleId = priced.taxRuleId;
              selectedTaxRate = priced.taxRate;
            }
            await db.quotationPackage.create({
              data: { quotationId: quote.id, ...packageWriteData(priced.frozen, layers) },
            });
          }
          if (selectedLayers) {
            await db.quotation.update({
              where: { id: quote.id },
              data: {
                amount: selectedLayers.amount,
                gst: selectedLayers.gst,
                total: selectedLayers.total,
                totalSelling: selectedLayers.totalSelling,
                totalNetCost: selectedLayers.totalNetCost,
                grossProfit: selectedLayers.grossProfit,
                profitMargin: selectedLayers.profitMargin,
                discountAmount: selectedLayers.discountAmount,
                taxableAmount: selectedLayers.taxableAmount,
                perPersonCost: selectedLayers.perPersonCost,
                items: incomingPackages.length,
                taxRate: selectedTaxRate,
                taxRuleId: selectedTaxRuleId,
                pricingStatus: selectedUnresolved ? "UNRESOLVED" : "OK",
              },
            });
          }
        } catch (pkgErr) {
          logger.error(pkgErr);
          await db.quotationPackage.create({
            data: {
              quotationId: quote.id,
              name: asStr(body.packageName, "Standard"),
              sortOrder: 0,
              isSelected: true,
              inclusions: body.packageIncludes || ["Accommodation", "Breakfast"],
              exclusions: body.packageExcludes || ["Flights", "Personal expenses"],
            },
          });
        }
      } else {
        await db.quotationPackage.create({
          data: {
            quotationId: quote.id,
            name: asStr(body.packageName, "Standard"),
            sortOrder: 0,
            isSelected: true,
            inclusions: body.packageIncludes || ["Accommodation", "Breakfast"],
            exclusions: body.packageExcludes || ["Flights", "Personal expenses"],
          },
        });
      }

      try {
        await writeQuoteAudit({
          req,
          agencyId: quote.agencyId,
          quotationId: quote.id,
          action: "Quote Created",
          updatedValue: { quoteNo },
        });
      } catch (auditErr) {
        logger.error(auditErr);
      }
      try {
        await ensureInitialQuotationVersion({
          quotationId: quote.id,
          createdByName: req.auth?.email || "System",
          createdById: createdById || undefined,
          changeSummary: "Version 1",
        });
      } catch (versionErr) {
        logger.error(versionErr);
      }
      try {
        await notifyQuote({
          agencyId: quote.agencyId,
          title: "New quote created",
          message: `${quoteNo} created for ${quote.customerName}`,
        });
      } catch (notifyErr) {
        logger.error(notifyErr);
      }

      const full = await db.quotation.findUnique({ where: { id: quote.id }, include: QUOTE_INCLUDE });
      res.status(201).json({ quotation: sanitizeQuotationForRole((full || quote) as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: publicErrorMessage(e, "Could not save quotation") });
    }
  });

  // ── Update wizard / full quote ───────────────────────────────────────────
  app.put("/api/quotations/:id/wizard", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (req.auth?.role === "customer") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const agentActor = req.auth?.role === "travel_agent";
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (["Converted to Booking", "Archived"].includes(existing.status)) {
        res.status(400).json({ error: "Cannot edit this quotation" });
        return;
      }

      let body = (req.body || {}) as Record<string, unknown>;
      const dateBlock = travelDatesUpdateBlockReason(body, existing);
      if (dateBlock) {
        res.status(400).json({ error: dateBlock });
        return;
      }
      if (agentActor) {
        body = stripAgentPricingOverrides(body);
        body.agentId = req.auth?.userId;
        delete body.internalNotes;
        delete body.trevioMarkupType;
        delete body.trevioMarkupValue;
        delete body.discountType;
        delete body.discountValue;
      }
      const tripBasics = resolveTripBasicsFromBody(body, existing);
      const nights = tripBasics.nights;

      // Over-limit discounts are allowed but require a Discount approval stage (not a hard 400).
      const nextDiscountType = isAgentLike(req.auth?.role)
        ? existing.discountType
        : (body.discountType !== undefined ? emptyToNull(body.discountType) : existing.discountType);
      const nextDiscountValue = isAgentLike(req.auth?.role)
        ? existing.discountValue
        : (body.discountValue != null ? toFloat(body.discountValue, 0) : existing.discountValue);

      const data: Record<string, unknown> = {};
      const scalarKeys = [
        "customerName", "service", "contactPerson", "contactEmail", "contactPhone",
        "destination", "country", "coverImage", "departureCity", "travelDates", "travelStartDate", "travelEndDate",
        "returnDate", "adults", "children", "infants", "currency", "baseCurrency",
        "agentName", "agentId", "agentCode", "agencyCode", "salesExecutiveName", "salesExecutivePhone", "salesExecutiveEmail",
        "specialRequests", "internalNotes", "enquiryRef", "validTill", "quoteDate",
        "leadId", "termsAndConditions", "paymentTerms", "cancellationPolicy", "refundPolicy",
        "hotelTerms", "flightTerms", "visaTerms", "insuranceTerms", "forceMajeure", "travelDisclaimer",
        "discountType", "hotelStarPreference", "roomTypePreference", "mealPlanPreference",
        "nationality",
      ] as const;
      for (const k of scalarKeys) {
        if (k === "quoteDate") continue;
        if (body[k] !== undefined) data[k] = k === "leadId" ? emptyToNull(body[k]) : body[k];
      }
      if (body.budget != null) data.budget = toInt(body.budget, 0);
      if (body.exchangeRate != null && body.exchangeRateExplicit === true) data.exchangeRate = toFloat(body.exchangeRate, 1) || 1;
      if (body.discountValue != null) data.discountValue = toFloat(body.discountValue, 0);
      if (body.wizardStep != null) data.wizardStep = Math.max(1, toInt(body.wizardStep, 1) || 1);
      if (body.adults != null) data.adults = Math.max(1, toInt(body.adults, 2) || 2);
      if (body.children != null) data.children = Math.max(0, toInt(body.children, 0));
      if (body.infants != null) data.infants = Math.max(0, toInt(body.infants, 0));
      if (body.rooms != null) data.rooms = Math.max(1, toInt(body.rooms, 1) || 1);
      if (body.landOnly != null) data.landOnly = body.landOnly === true;
      if (body.estimatedBookingDate !== undefined) data.estimatedBookingDate = optionalDateString(body.estimatedBookingDate);
      if (tripBasics.tripCities !== undefined) {
        data.tripCities = tripBasics.tripCities as unknown as Prisma.InputJsonValue;
        if (tripBasics.destination) data.destination = tripBasics.destination;
      }
      if (body.isInternational != null) data.isInternational = Boolean(body.isInternational);
      if (body.packageIncludes) data.packageIncludes = body.packageIncludes;
      if (body.packageExcludes) data.packageExcludes = body.packageExcludes;
      if (nights != null) {
        data.nights = nights;
        data.days = nights + 1;
      }
      if (existing.status === "Draft" && body.advanceStatus !== false) {
        data.status = "In Progress";
      }

      const codes = await resolveQuoteAgentCodes({
        req,
        body: {
          ...body,
          agentId: body.agentId ?? existing.agentId,
          agentName: body.agentName ?? existing.agentName,
          agencyCode: body.agencyCode ?? existing.agencyCode,
          agentCode: body.agentCode ?? existing.agentCode,
        },
        agencyId: existing.agencyId || ownAgencyId(req, emptyToNull(body.agencyId) || undefined),
      });
      data.agencyCode = codes.agencyCode;
      data.agentCode = codes.agentCode;
      if (codes.agentId) data.agentId = codes.agentId;
      if (codes.agentName) data.agentName = codes.agentName;

      await db.quotation.update({ where: { id: existing.id }, data });

      let pricedTaxRuleId: string | null = existing.taxRuleId;
      if (Array.isArray(body.packages)) {
        const packages = body.packages as Record<string, unknown>[];
        const keepIds = packages.map((p) => p.id).filter((id): id is string => typeof id === "string" && Boolean(id));
        await db.quotationPackage.deleteMany({
          where: {
            quotationId: existing.id,
            ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
          },
        });
        for (const pkg of packages) {
          const frozen = await freezePackageLines(pkg, {
            travelDate: emptyToNull(body.travelStartDate) ?? existing.travelStartDate,
            travelEndDate: emptyToNull(body.travelEndDate) ?? existing.travelEndDate,
            existingPackages: existing.packages as unknown as Array<Record<string, unknown>>,
            scope: catalogRateScope(req, agencyScope),
          });
          const pricedPkg = await priceFrozenPackage(frozen, {
            currency: asStr(body.currency, existing.currency || "INR"),
            nights: nights ?? existing.nights,
            adults: body.adults != null ? toInt(body.adults, existing.adults ?? 2) : existing.adults,
            children: body.children != null ? toInt(body.children, existing.children ?? 0) : existing.children,
            infants: body.infants != null ? toInt(body.infants, existing.infants ?? 0) : existing.infants,
            trevioMarkupType: isAgentLike(req.auth?.role)
              ? existing.trevioMarkupType
              : (emptyToNull(body.trevioMarkupType) ?? existing.trevioMarkupType),
            trevioMarkupValue: isAgentLike(req.auth?.role)
              ? existing.trevioMarkupValue
              : (asNumOrUndef(body.trevioMarkupValue) ?? existing.trevioMarkupValue),
            agentMarkupType: emptyToNull(body.agentMarkupType) ?? existing.agentMarkupType,
            agentMarkup: asNumOrUndef(body.agentMarkup) ?? existing.agentMarkup,
            discountType: isAgentLike(req.auth?.role)
              ? existing.discountType
              : (emptyToNull(body.discountType) ?? existing.discountType),
            discountValue: isAgentLike(req.auth?.role)
              ? existing.discountValue
              : (asNumOrUndef(body.discountValue) ?? existing.discountValue),
            travelStartDate: emptyToNull(body.travelStartDate) ?? existing.travelStartDate,
            exchangeRate: existing.exchangeRate,
            exchangeRateExplicit: body.exchangeRateExplicit === true || existing.exchangeRateExplicit,
            scope: catalogRateScope(req, agencyScope),
          });
          if (pkg.isSelected || pricedTaxRuleId === existing.taxRuleId) pricedTaxRuleId = pricedPkg.taxRuleId;
          const pkgData = packageWriteData(pricedPkg.frozen, layersFromPackage(pricedPkg.priced));
          if (typeof pkg.id === "string" && pkg.id) {
            await db.quotationPackage.updateMany({
              where: { id: pkg.id, quotationId: existing.id },
              data: pkgData,
            });
          } else {
            await db.quotationPackage.create({
              data: { quotationId: existing.id, ...pkgData },
            });
          }
        }
      }

      const packages = await db.quotationPackage.findMany({ where: { quotationId: existing.id } });
      const selectedStored = packages.find((p) => p.isSelected) || packages[0];
      const selectedPricing = selectedStored?.pricing as { unresolved?: boolean; reasons?: string[]; taxRate?: number | null; taxRequired?: boolean } | null;
      const rolled = {
        totalNetCost: selectedStored?.totalNetCost ?? 0,
        totalSelling: selectedStored?.totalSelling ?? 0,
        grossProfit: selectedStored ? selectedStored.totalSelling - selectedStored.totalNetCost : 0,
        profitMargin: selectedStored && selectedStored.totalSelling > 0
          ? Math.round(((selectedStored.totalSelling - selectedStored.totalNetCost) / selectedStored.totalSelling) * 10000) / 100
          : 0,
        discountAmount: Number((selectedStored?.pricing as { discountAmount?: number } | null)?.discountAmount ?? existing.discountAmount ?? 0),
        taxableAmount: Number((selectedStored?.pricing as { customerPrice?: number } | null)?.customerPrice ?? selectedStored?.totalSelling ?? 0),
        gst: selectedStored?.gst ?? 0,
        total: selectedStored?.total ?? 0,
        amount: Number((selectedStored?.pricing as { customerPrice?: number } | null)?.customerPrice ?? selectedStored?.total ?? 0),
        perPersonCost: selectedStored?.perPersonCost ?? 0,
        items: packages.length,
      };
      if (body.trevioMarkupType && !isAgentLike(req.auth?.role)) data.trevioMarkupType = body.trevioMarkupType === "Fixed" ? "Fixed" : "Percentage";
      if (body.trevioMarkupValue != null && !isAgentLike(req.auth?.role)) data.trevioMarkupValue = Number(body.trevioMarkupValue);
      if (body.agentMarkup != null) data.agentMarkup = Math.max(0, Math.round(Number(body.agentMarkup)));
      if (body.agentMarkupType) data.agentMarkupType = body.agentMarkupType === "Percentage" ? "Percentage" : "Fixed";
      if (body.exchangeRateExplicit === true) data.exchangeRateExplicit = true;
      data.taxRate = selectedPricing?.taxRate ?? 0;
      data.taxRuleId = pricedTaxRuleId;
      data.pricingStatus = selectedPricing?.unresolved ? "UNRESOLVED" : "OK";

      const updated = await db.quotation.update({
        where: { id: existing.id },
        data: {
          totalNetCost: rolled.totalNetCost,
          totalSelling: rolled.totalSelling,
          grossProfit: rolled.grossProfit,
          profitMargin: rolled.profitMargin,
          discountAmount: rolled.discountAmount,
          taxableAmount: rolled.taxableAmount,
          gst: rolled.gst,
          total: rolled.total,
          amount: rolled.amount,
          perPersonCost: rolled.perPersonCost,
          items: Math.max(1, packages.length),
          lineItems: buildLineItemsFromPackages(packages),
          taxRate: data.taxRate as number,
          taxRuleId: (data.taxRuleId as string | null) ?? null,
          pricingStatus: data.pricingStatus as string,
          ...(data.trevioMarkupType ? { trevioMarkupType: data.trevioMarkupType as string } : {}),
          ...(data.trevioMarkupValue != null ? { trevioMarkupValue: data.trevioMarkupValue as number } : {}),
          ...(data.agentMarkup != null ? { agentMarkup: data.agentMarkup as number } : {}),
          ...(data.agentMarkupType ? { agentMarkupType: data.agentMarkupType as string } : {}),
          ...(data.exchangeRateExplicit === true ? { exchangeRateExplicit: true } : {}),
        },
        include: QUOTE_INCLUDE,
      });

      await recordQuotationRevisionIfNeeded({
        quotationId: existing.id,
        before: existing as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
        createdByName: req.auth?.email || "System",
        createdById: req.auth?.userId,
        changeSummary: "Wizard save",
        reason: "wizard_update",
      });

      await applyDiscountApproval({
        quotationId: existing.id,
        role: req.auth?.role,
        email: req.auth?.email,
        discountType: nextDiscountType,
        discountValue: nextDiscountValue,
        approvals: existing.approvals,
        discountChanged:
          String(nextDiscountType || "") !== String(existing.discountType || "")
          || Number(nextDiscountValue || 0) !== Number(existing.discountValue || 0),
      });

      const latest = await db.quotation.findUnique({ where: { id: existing.id }, include: QUOTE_INCLUDE });

      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Edited",
        previousValue: { total: existing.total, status: existing.status, currentVersion: existing.currentVersion },
        updatedValue: { total: latest?.total, status: latest?.status, wizardStep: latest?.wizardStep, currentVersion: latest?.currentVersion },
      });

      res.json({ quotation: sanitizeQuotationForRole((latest || updated) as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 400) {
        res.status(400).json({ error: e instanceof Error ? e.message : "Validation failed" });
        return;
      }
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  /**
   * Phase 13 TM-02 — Apply QuoteTemplate section content into the quotation.
   * fill-empty (default) never overwrites non-empty user fields.
   * Snapshot stored on quotation so later template edits do not rewrite history.
   */
  app.post("/api/quotations/:id/apply-template", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (req.auth?.role === "customer") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (["Converted to Booking", "Expired", "Cancelled", "Archived"].includes(existing.status)) {
        res.status(400).json({ error: `Cannot apply template to a quotation in status ${existing.status}` });
        return;
      }
      const templateId = String(req.body?.templateId || "");
      if (!templateId) {
        res.status(400).json({ error: "templateId required" });
        return;
      }
      const mode: MergeMode = req.body?.mode === "merge-append" ? "merge-append" : "fill-empty";
      const packageIndex = Math.max(0, Number(req.body?.packageIndex ?? 0));

      const template = await db.quoteTemplate.findFirst({
        where: {
          id: templateId,
          ...agencyScope(req),
          deletedAt: null,
          status: "Active",
        },
        include: { sections: { orderBy: { sortOrder: "asc" } } },
      });
      if (!template) {
        res.status(404).json({ error: "Active quote template not found" });
        return;
      }

      const content = extractTemplateContent({
        templateId: template.id,
        templateName: template.templateName,
        sections: template.sections,
      });
      const packages = [...(existing.packages || [])] as Array<Record<string, unknown>>;
      if (!packages.length) {
        res.status(400).json({ error: "Quotation has no packages to merge into" });
        return;
      }
      const pkgIdx = Math.min(packageIndex, packages.length - 1);
      const targetPkg = packages[pkgIdx];
      const { quotePatch, packagePatch, appliedFields } = mergeTemplateIntoQuotation({
        mode,
        quote: existing as unknown as Record<string, unknown>,
        pkg: targetPkg,
        content,
      });

      if (!appliedFields.length) {
        res.json({
          quotation: sanitizeQuotationForRole(existing as unknown as Record<string, unknown>, req.auth?.role),
          appliedFields: [],
          message: "No empty fields to fill from this template",
        });
        return;
      }

      packages[pkgIdx] = { ...targetPkg, ...packagePatch };
      const frozenPackages: Array<Record<string, unknown>> = [];
      for (const pkg of packages) {
        frozenPackages.push(await freezePackageLines(pkg, {
          travelDate: existing.travelStartDate,
          travelEndDate: existing.travelEndDate,
          existingPackages: existing.packages as unknown as Array<Record<string, unknown>>,
          scope: catalogRateScope(req, agencyScope),
        }));
      }

      await db.$transaction(async (tx) => {
        await tx.quotation.update({
          where: { id: existing.id },
          data: {
            ...quotePatch,
            templateSnapshot: content as unknown as Prisma.InputJsonValue,
            appliedTemplateId: template.id,
          },
        });
        for (let i = 0; i < frozenPackages.length; i += 1) {
          const pkg = frozenPackages[i];
          const id = String((packages[i] as { id?: string }).id || "");
          if (!id) continue;
          await tx.quotationPackage.update({
            where: { id },
            data: {
              description: pkg.description != null ? String(pkg.description) : undefined,
              hotels: (pkg.hotels ?? []) as Prisma.InputJsonValue,
              flights: (pkg.flights ?? []) as Prisma.InputJsonValue,
              transfers: (pkg.transfers ?? []) as Prisma.InputJsonValue,
              activities: (pkg.activities ?? []) as Prisma.InputJsonValue,
              meals: (pkg.meals ?? []) as Prisma.InputJsonValue,
              itinerary: (pkg.itinerary ?? []) as Prisma.InputJsonValue,
              inclusions: (pkg.inclusions ?? []) as Prisma.InputJsonValue,
              exclusions: (pkg.exclusions ?? []) as Prisma.InputJsonValue,
              visa: (pkg.visa ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            },
          });
        }
      });

      const after = await db.quotation.findUnique({ where: { id: existing.id }, include: QUOTE_INCLUDE });
      await recordQuotationRevisionIfNeeded({
        quotationId: existing.id,
        before: existing as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
        createdByName: req.auth?.email || "System",
        createdById: req.auth?.userId,
        changeSummary: `Applied quote template ${template.templateName}`,
        reason: "template_apply",
      });

      const latest = await db.quotation.findUnique({ where: { id: existing.id }, include: QUOTE_INCLUDE });
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Template Applied",
        updatedValue: { templateId: template.id, mode, appliedFields },
      });

      res.json({
        quotation: sanitizeQuotationForRole(latest as unknown as Record<string, unknown>, req.auth?.role),
        appliedFields,
        templateSnapshot: content,
        mode,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Status transition ────────────────────────────────────────────────────
  app.post("/api/quotations/:id/status", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const to = String(req.body?.status || "");
      const override = ["super_admin", "agency_admin"].includes(req.auth?.role || "") && Boolean(req.body?.override);
      if (!canTransition(existing.status, to, override) && !canTransition(normalizeStatus(existing.status), to, override)) {
        res.status(400).json({ error: `Invalid transition ${existing.status} → ${to}` });
        return;
      }
      if (isAgentLike(req.auth?.role) && !["Accepted", "Rejected", "Revision Requested", "Customer Reviewing"].includes(to)) {
        res.status(403).json({ error: "Agents can only accept, reject, or request revision" });
        return;
      }
      if (to === "Sent to Agent" || to === "Sent") {
        const blocked = quoteSendBlockReason(existing);
        if (blocked) {
          res.status(403).json({ error: blocked });
          return;
        }
      }

      const data: Record<string, unknown> = { status: to };
      if (to === "Archived") data.archivedAt = new Date();
      if (to === "Sent to Agent" || to === "Sent") {
        data.status = "Sent to Agent";
        data.termsSnapshot = buildTermsSnapshot(existing);
      }
      if (to === "Pending Approval") data.approvalStatus = "Pending";
      if (to === "Accepted") {
        data.acceptedVersionNumber = existing.currentVersion || 1;
        data.acceptedAt = existing.acceptedAt || new Date();
        data.acceptedByName = existing.acceptedByName || req.auth?.email || "Staff";
        data.acceptedByEmail = existing.acceptedByEmail || req.auth?.email || null;
      }

      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data,
        include: QUOTE_INCLUDE,
      });

      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Status Changed",
        previousValue: { status: existing.status },
        updatedValue: { status: quotation.status },
        details: req.body?.comments,
      });
      await notifyQuote({
        agencyId: existing.agencyId,
        title: `Quote ${quotation.status}`,
        message: `${quotation.quoteNo} is now ${quotation.status}`,
        priority: "high",
      });

      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Submit / approve / reject (internal) ─────────────────────────────────
  app.post("/api/quotations/:id/submit-approval", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const unresolved = quoteUnresolvedRateReason(existing.packages as unknown as Array<Record<string, unknown>>)
        || pricingFinalizationBlock(existing.packages);
      if (unresolved) {
        res.status(400).json({ error: unresolved });
        return;
      }
      const discountBlocked = discountApprovalBlockReason(existing, req.auth?.role);
      if (discountBlocked) {
        res.status(400).json({ error: discountBlocked });
        return;
      }
      // Executive Prep → Team Lead → Finance (optional) → Ready to Send
      await db.quotationApproval.create({
        data: {
          quotationId: existing.id,
          stage: "Executive Prep",
          status: "Approved",
          approverName: req.auth?.email,
          approverRole: req.auth?.role,
          comments: "Submitted for internal approval",
          decidedAt: new Date(),
        },
      });
      await db.quotationApproval.create({
        data: {
          quotationId: existing.id,
          stage: "Team Lead",
          status: "Pending",
        },
      });
      if (req.body?.financeApprovalRequired === true) {
        await db.quotationApproval.create({
          data: {
            quotationId: existing.id,
            stage: "Finance",
            status: "Pending",
          },
        });
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Pending Approval", approvalStatus: "Pending" },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Approval Submitted" });
      await notifyQuote({ agencyId: existing.agencyId, title: "Approval required", message: `${existing.quoteNo} awaiting Team Lead approval`, priority: "high" });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/approve", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager", "management", "accountant", "team_lead"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const stage = String(req.body?.stage || "Team Lead");
      if (!canApproveStage(req.auth?.role, stage)) {
        res.status(403).json({ error: "You cannot approve this stage" });
        return;
      }
      const approvals = existing.approvals || [];
      const latest = (name: string) => [...approvals].reverse().find((row) => row.stage === name);
      if (stage === "Finance" && latest("Team Lead")?.status !== "Approved") {
        res.status(403).json({ error: "Team Lead approval is required before Finance approval" });
        return;
      }
      if (stage === "Team Lead" && latest("Team Lead")?.status === "Rejected") {
        res.status(403).json({ error: "This approval was rejected" });
        return;
      }
      if (stage === "Team Lead") {
        const discountBlocked = discountApprovalBlockReason(existing, req.auth?.role);
        if (discountBlocked && latest("Discount")?.status === "Pending") {
          // Managers who can approve Discount may clear it in the same action.
          if (canApproveStage(req.auth?.role, "Discount")) {
            await db.quotationApproval.create({
              data: {
                quotationId: existing.id,
                stage: "Discount",
                status: "Approved",
                approverName: req.auth?.email,
                approverRole: req.auth?.role,
                comments: req.body?.comments || "Approved with Team Lead",
                decidedAt: new Date(),
              },
            });
          } else {
            res.status(400).json({ error: discountBlocked });
            return;
          }
        } else if (discountBlocked) {
          res.status(400).json({ error: discountBlocked });
          return;
        }
      }

      await db.quotationApproval.create({
        data: {
          quotationId: existing.id,
          stage,
          status: "Approved",
          approverName: req.auth?.email,
          approverRole: req.auth?.role,
          comments: req.body?.comments,
          decidedAt: new Date(),
        },
      });

      // Discount-only approvals do not flip overall quote approvalStatus.
      if (stage === "Discount") {
        const quotation = await db.quotation.findUnique({
          where: { id: existing.id },
          include: QUOTE_INCLUDE,
        });
        await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Approved", details: stage, updatedValue: { stage, comments: req.body?.comments, approver: req.auth?.email } });
        await notifyQuote({ agencyId: existing.agencyId, title: "Discount approved", message: `${existing.quoteNo} discount approved` });
        res.json({ quotation });
        return;
      }

      const finance = stage === "Finance" ? { status: "Approved" } : latest("Finance");
      const teamApproved = stage === "Team Lead" || latest("Team Lead")?.status === "Approved";
      const financeDone = !finance || finance.status === "Approved";
      const ready = teamApproved && financeDone;
      if (ready) {
        await db.quotationApproval.create({
          data: {
            quotationId: existing.id,
            stage: "Ready to Send",
            status: "Approved",
            approverName: req.auth?.email,
            approverRole: req.auth?.role,
            comments: req.body?.comments || "Internal approval complete",
            decidedAt: new Date(),
          },
        });
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: {
          approvalStatus: ready ? "Approved" : "Pending",
          // Keep Pending Approval until the quote is actually sent — UI maps Approved → "Ready to Send".
          status: existing.status === "Pending Approval" || existing.status === "In Progress"
            ? "Pending Approval"
            : existing.status,
        },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Approved", details: stage, updatedValue: { stage, comments: req.body?.comments, approver: req.auth?.email, ready } });
      await notifyQuote({
        agencyId: existing.agencyId,
        title: ready ? "Ready to send" : "Approval approved",
        message: ready ? `${existing.quoteNo} is ready to send` : `${existing.quoteNo} approved (${stage})`,
      });
      res.json({
        quotation,
        readyToSend: ready,
        message: ready
          ? "Approved and ready to send. Download PDF or Email/WhatsApp the customer."
          : `${stage} approved.`,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/reject-approval", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager", "management", "accountant", "team_lead"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const stage = String(req.body?.stage || "Team Lead");
      if (!canApproveStage(req.auth?.role, stage)) {
        res.status(403).json({ error: "You cannot reject this stage" });
        return;
      }
      await db.quotationApproval.create({
        data: {
          quotationId: existing.id,
          stage,
          status: "Rejected",
          approverName: req.auth?.email,
          approverRole: req.auth?.role,
          comments: req.body?.comments,
          decidedAt: new Date(),
        },
      });
      if (stage === "Discount") {
        const quotation = await db.quotation.findUnique({
          where: { id: existing.id },
          include: QUOTE_INCLUDE,
        });
        await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Rejected", details: req.body?.comments || "Discount rejected" });
        await notifyQuote({ agencyId: existing.agencyId, title: "Discount rejected", message: `${existing.quoteNo} discount returned for revision`, priority: "high" });
        res.json({ quotation });
        return;
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "In Progress", approvalStatus: "Rejected" },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Rejected", details: req.body?.comments });
      await notifyQuote({ agencyId: existing.agencyId, title: "Approval rejected", message: `${existing.quoteNo} returned for edits`, priority: "high" });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Customer/agent accept / reject / revision ────────────────────────────
  app.post("/api/quotations/:id/accept", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const transitionBlocked = quoteStaffAcceptTransitionBlockReason(existing.status);
      if (transitionBlocked) {
        res.status(400).json({ error: transitionBlocked });
        return;
      }
      if (existing.status === "Expired" || quotePastValidityBlockReason(existing)) {
        res.status(400).json({ error: "Quotation expired — renew before accepting" });
        return;
      }
      const unresolved = quoteUnresolvedRateReason(existing.packages as unknown as Array<Record<string, unknown>>)
        || pricingFinalizationBlock(existing.packages);
      if (unresolved) {
        res.status(400).json({ error: unresolved });
        return;
      }
      const packageId = req.body?.selectedPackageId as string | undefined;
      if (packageId) {
        await db.quotationPackage.updateMany({ where: { quotationId: existing.id }, data: { isSelected: false } });
        await db.quotationPackage.updateMany({ where: { id: packageId, quotationId: existing.id }, data: { isSelected: true } });
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: {
          status: "Accepted",
          selectedPackageId: packageId || existing.selectedPackageId,
          acceptedByName: req.body?.personName || req.auth?.email,
          acceptedByEmail: req.body?.email || req.auth?.email,
          acceptedAt: new Date(),
          acceptedVersionNumber: existing.currentVersion || 1,
        },
        include: QUOTE_INCLUDE,
      });
      await db.quotationCustomerResponse.create({
        data: {
          quotationId: existing.id,
          versionNumber: existing.currentVersion || 1,
          responseType: "Accept",
          comment: "Accepted via authenticated staff/agent action",
          customerName: req.body?.personName || req.auth?.email,
          customerEmail: req.body?.email || req.auth?.email,
          selectedPackageId: packageId || existing.selectedPackageId || undefined,
        },
      }).catch(() => undefined);
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Accepted",
        updatedValue: { acceptedByName: quotation.acceptedByName, selectedPackageId: quotation.selectedPackageId },
      });
      await notifyQuote({ agencyId: existing.agencyId, title: "Quote accepted", message: `${existing.quoteNo} accepted`, priority: "high" });
      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/reject", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!canTransition(existing.status, "Rejected") && !canTransition(normalizeStatus(existing.status), "Rejected")) {
        res.status(400).json({ error: `Cannot reject a quotation in status ${existing.status}` });
        return;
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Rejected", rejectedReason: req.body?.reason || req.body?.comments },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Quote Rejected", details: req.body?.reason });
      await notifyQuote({ agencyId: existing.agencyId, title: "Quote rejected", message: `${existing.quoteNo} rejected` });
      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/request-revision", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        !canTransition(existing.status, "Revision Requested")
        && !canTransition(normalizeStatus(existing.status), "Revision Requested")
      ) {
        res.status(400).json({ error: `Cannot request revision in status ${existing.status}` });
        return;
      }
      await db.quotationRevision.create({
        data: {
          quotationId: existing.id,
          requestedBy: req.body?.requestedBy || req.auth?.email || "Agent",
          requestedByRole: req.auth?.role,
          comments: req.body?.comments,
          requestedChanges: req.body?.requestedChanges,
        },
      });
      await snapshotVersion(existing.id, req.auth?.email || "System", req.auth?.userId, "Before revision", req.body?.comments);
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Revision Requested" },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Revision Requested", details: req.body?.comments });
      await notifyQuote({ agencyId: existing.agencyId, title: "Revision requested", message: `${existing.quoteNo}: ${req.body?.comments || "Changes requested"}`, priority: "high" });
      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Duplicate / archive / delete draft ───────────────────────────────────
  app.post("/api/quotations/:id/duplicate", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const quoteNo = await nextQuoteNo();
      const created = await db.quotation.create({
        data: {
          quoteNo,
          agencyId: existing.agencyId,
          branchId: ownBranchId(req) ?? existing.branchId,
          customerName: existing.customerName,
          service: existing.service,
          items: existing.items,
          amount: existing.amount,
          gst: existing.gst,
          total: existing.total,
          status: "Draft",
          validTill: existing.validTill,
          quoteDate: todayYmd(),
          createdById: req.auth?.userId,
          createdBy: req.auth?.email || existing.createdBy,
          isInternational: existing.isInternational,
          contactPerson: existing.contactPerson,
          contactEmail: existing.contactEmail,
          contactPhone: existing.contactPhone,
          destination: existing.destination,
          country: existing.country,
          coverImage: existing.coverImage,
          departureCity: existing.departureCity,
          travelDates: existing.travelDates,
          travelStartDate: existing.travelStartDate,
          travelEndDate: existing.travelEndDate,
          returnDate: existing.returnDate,
          nights: existing.nights,
          days: existing.days,
          adults: existing.adults,
          children: existing.children,
          infants: existing.infants,
          rooms: existing.rooms,
          hotelStarPreference: existing.hotelStarPreference,
          nationality: existing.nationality,
          landOnly: existing.landOnly,
          estimatedBookingDate: existing.estimatedBookingDate,
          tripCities: existing.tripCities ?? [],
          currency: existing.currency,
          baseCurrency: existing.baseCurrency,
          exchangeRate: existing.exchangeRate,
          packageIncludes: existing.packageIncludes ?? [],
          packageExcludes: existing.packageExcludes ?? [],
          termsAndConditions: existing.termsAndConditions,
          paymentTerms: existing.paymentTerms,
          cancellationPolicy: existing.cancellationPolicy,
          refundPolicy: existing.refundPolicy,
          hotelTerms: existing.hotelTerms,
          flightTerms: existing.flightTerms,
          visaTerms: existing.visaTerms,
          insuranceTerms: existing.insuranceTerms,
          forceMajeure: existing.forceMajeure,
          travelDisclaimer: existing.travelDisclaimer,
          salesExecutiveName: existing.salesExecutiveName,
          agentName: existing.agentName,
          lineItems: existing.lineItems ?? [],
          totalNetCost: existing.totalNetCost,
          totalSelling: existing.totalSelling,
          grossProfit: existing.grossProfit,
          profitMargin: existing.profitMargin,
          discountType: existing.discountType,
          discountValue: existing.discountValue,
          discountAmount: existing.discountAmount,
          taxRate: existing.taxRate,
          taxableAmount: existing.taxableAmount,
          perPersonCost: existing.perPersonCost,
          specialRequests: existing.specialRequests,
          approvalStatus: "Draft",
          currentVersion: 1,
          wizardStep: 1,
        },
      });
      for (const pkg of existing.packages) {
        await db.quotationPackage.create({
          data: {
            quotationId: created.id,
            name: pkg.name,
            sortOrder: pkg.sortOrder,
            isSelected: pkg.isSelected,
            description: pkg.description,
            hotels: pkg.hotels ?? [],
            flights: pkg.flights ?? [],
            transfers: pkg.transfers ?? [],
            activities: pkg.activities ?? [],
            meals: pkg.meals ?? [],
            itinerary: pkg.itinerary ?? [],
            visa: pkg.visa ?? undefined,
            insurance: pkg.insurance ?? undefined,
            addOns: pkg.addOns ?? [],
            inclusions: pkg.inclusions ?? [],
            exclusions: pkg.exclusions ?? [],
            totalNetCost: pkg.totalNetCost,
            totalSelling: pkg.totalSelling,
            grossProfit: pkg.grossProfit,
            gst: pkg.gst,
            total: pkg.total,
            perPersonCost: pkg.perPersonCost,
          },
        });
      }
      await writeQuoteAudit({ req, agencyId: created.agencyId, quotationId: created.id, action: "Quote Duplicated", details: `From ${existing.quoteNo}` });
      const full = await db.quotation.findUnique({ where: { id: created.id }, include: QUOTE_INCLUDE });
      res.status(201).json({ quotation: full });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/archive", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Archived", archivedAt: new Date() },
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Quote Archived" });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/quotations/:id/draft", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (existing.status !== "Draft") {
        res.status(400).json({ error: "Only draft quotations can be deleted" });
        return;
      }
      await db.quotation.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), status: "Archived", archivedAt: new Date() },
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Quote Deleted" });
      res.json({ success: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Extend validity / expire ─────────────────────────────────────────────
  app.post("/api/quotations/:id/extend", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const validTill = String(req.body?.validTill || "");
      if (!validTill) {
        res.status(400).json({ error: "validTill required" });
        return;
      }
      const extendBlock = travelDatesBlockReason({ validTill });
      if (extendBlock) {
        res.status(400).json({ error: extendBlock });
        return;
      }
      const data: Record<string, unknown> = { validTill, expiredAt: null };
      // Renewing an expired quote returns it to In Progress and clears approval —
      // never auto-restore Sent/Approved (Phase 1 + Phase 8).
      if (existing.status === "Expired") {
        data.status = "In Progress";
        data.approvalStatus = "Draft";
      }
      const quotation = await db.quotation.update({ where: { id: existing.id }, data, include: QUOTE_INCLUDE });
      if (existing.status === "Expired") {
        await db.quotationApproval.deleteMany({ where: { quotationId: existing.id } });
      }
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Renewed",
        previousValue: { validTill: existing.validTill, status: existing.status },
        updatedValue: { validTill, status: quotation.status },
      });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/expire-due", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res: Response) => {
    try {
      const result = await runExpireDueQuotations({ agencyWhere: { ...agencyScope(req) } });
      res.json({ expired: result.expired, scanned: result.scanned, skipped: result.skipped, errors: result.errors, today: result.today });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Versions ─────────────────────────────────────────────────────────────
  app.post("/api/quotations/:id/versions", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const version = await createQuotationVersion({
        quotationId: existing.id,
        createdByName: req.auth?.email || "System",
        createdById: req.auth?.userId,
        changeSummary: req.body?.changeSummary,
        reason: req.body?.reason || "manual",
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Version Created", details: `v${version?.versionNumber}` });
      res.status(201).json({ version });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/quotations/:id/versions", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const rows = await db.quotationVersion.findMany({
        where: { quotationId: existing.id },
        orderBy: { versionNumber: "desc" },
      });
      res.json({
        versions: rows.map((row) => summarizeVersionForList(row, req.auth?.role)),
        currentVersion: existing.currentVersion,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/quotations/:id/versions/:versionNumber", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const versionNumber = parseInt(String(Array.isArray(req.params.versionNumber) ? req.params.versionNumber[0] : req.params.versionNumber), 10);
      if (!Number.isFinite(versionNumber) || versionNumber < 1) {
        res.status(400).json({ error: "Invalid version number" });
        return;
      }
      const row = await db.quotationVersion.findFirst({
        where: { quotationId: existing.id, versionNumber },
      });
      if (!row) {
        res.status(404).json({ error: "Version not found" });
        return;
      }
      const snapshot = sanitizeVersionSnapshot(row.snapshot, req.auth?.role);
      res.json({
        version: {
          id: row.id,
          versionNumber: row.versionNumber,
          changeSummary: row.changeSummary,
          reason: row.reason,
          createdByName: row.createdByName,
          createdById: row.createdById,
          createdAt: row.createdAt,
          readOnly: true,
          snapshot,
        },
        currentVersion: existing.currentVersion,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/versions/:vid/restore", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const vid = Array.isArray(req.params.vid) ? req.params.vid[0] : req.params.vid;
      const version = await db.quotationVersion.findFirst({ where: { id: vid, quotationId: existing.id } });
      if (!version) {
        res.status(404).json({ error: "Version not found" });
        return;
      }
      // Freeze current live state before applying restore content.
      await createQuotationVersion({
        quotationId: existing.id,
        createdByName: req.auth?.email || "System",
        createdById: req.auth?.userId,
        changeSummary: `Checkpoint before restore of v${version.versionNumber}`,
        reason: "pre_restore",
      });
      const snap = version.snapshot as Record<string, unknown>;
      await restorePackagesFromSnapshot(existing.id, snap);
      await db.quotationApproval.deleteMany({ where: { quotationId: existing.id } });
      const { revokeCustomerAccessForQuotation } = await import("../lib/quotation-customer-access.js");
      await revokeCustomerAccessForQuotation(existing.id);
      const snapValidTill = typeof snap.validTill === "string" ? snap.validTill.slice(0, 10) : existing.validTill;
      const validTill = isPastValidTill(snapValidTill) ? freshValidTill() : (snapValidTill || freshValidTill());
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: {
          status: "In Progress",
          approvalStatus: "Draft",
          validTill,
          expiredAt: null,
          acceptedVersionNumber: null,
          acceptedAt: null,
          acceptedByName: null,
          acceptedByEmail: null,
          amount: Number(snap.amount || existing.amount),
          gst: Number(snap.gst || existing.gst),
          total: Number(snap.total || existing.total),
          totalNetCost: Number(snap.totalNetCost || 0),
          totalSelling: Number(snap.totalSelling || 0),
          grossProfit: Number(snap.grossProfit || 0),
          lineItems: (snap.lineItems as object) ?? existing.lineItems,
          packageIncludes: (snap.packageIncludes as object) ?? existing.packageIncludes,
          packageExcludes: (snap.packageExcludes as object) ?? existing.packageExcludes,
          termsAndConditions: (snap.termsAndConditions as string) ?? existing.termsAndConditions,
          customerName: (snap.customerName as string) ?? existing.customerName,
          destination: (snap.destination as string) ?? existing.destination,
          country: (snap.country as string) ?? existing.country,
          departureCity: (snap.departureCity as string) ?? existing.departureCity,
          travelStartDate: (snap.travelStartDate as string) ?? existing.travelStartDate,
          travelEndDate: (snap.travelEndDate as string) ?? existing.travelEndDate,
          travelDates: (snap.travelDates as string) ?? existing.travelDates,
          nights: snap.nights != null ? Number(snap.nights) : existing.nights,
          days: snap.days != null ? Number(snap.days) : existing.days,
          adults: snap.adults != null ? Number(snap.adults) : existing.adults,
          children: snap.children != null ? Number(snap.children) : existing.children,
          infants: snap.infants != null ? Number(snap.infants) : existing.infants,
          rooms: snap.rooms != null ? Number(snap.rooms) : existing.rooms,
          hotelStarPreference: (snap.hotelStarPreference as string) ?? existing.hotelStarPreference,
          nationality: (snap.nationality as string) ?? existing.nationality,
          landOnly: typeof snap.landOnly === "boolean" ? snap.landOnly : existing.landOnly,
          estimatedBookingDate: (snap.estimatedBookingDate as string) ?? existing.estimatedBookingDate,
          tripCities: snap.tripCities != null
            ? (normalizeTripCities(snap.tripCities) as unknown as Prisma.InputJsonValue)
            : (existing.tripCities as Prisma.InputJsonValue),
        },
        include: QUOTE_INCLUDE,
      });
      await createQuotationVersion({
        quotationId: existing.id,
        createdByName: req.auth?.email || "System",
        createdById: req.auth?.userId,
        changeSummary: `Restored content from v${version.versionNumber}`,
        reason: "restore",
        full: quotation as unknown as Record<string, unknown>,
      });
      const latest = await db.quotation.findUnique({ where: { id: existing.id }, include: QUOTE_INCLUDE });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Version Restored", details: `v${version.versionNumber}` });
      res.json({ quotation: sanitizeQuotationForRole((latest || quotation) as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Share tracking (Link). Email/WhatsApp use dedicated delivery endpoints. ─
  app.post("/api/quotations/:id/share", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuoteForActor(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const channel = String(req.body?.channel || "Link");
      if (channel === "Email" || channel === "WhatsApp") {
        res.status(410).json({
          error: channel === "Email"
            ? "Use POST /api/quotations/:id/email for real quotation email delivery with PDF attachment."
            : "Use POST /api/quotations/:id/whatsapp for real WhatsApp delivery with the customer PDF.",
        });
        return;
      }
      const blocked = quoteSendBlockReason(existing);
      if (blocked) {
        res.status(403).json({ error: blocked });
        return;
      }
      const unresolved = quoteUnresolvedRateReason(existing.packages as unknown as Array<Record<string, unknown>>)
        || pricingFinalizationBlock(existing.packages);
      if (unresolved) {
        res.status(400).json({ error: unresolved });
        return;
      }
      const recipient = String(req.body?.recipient || existing.contactEmail || "");
      const appOrigin = resolveAppOrigin(req.body?.appOrigin);
      let customerUrl: string | null = null;
      try {
        const link = await createCustomerAccessLink({
          quotationId: existing.id,
          createdById: req.auth?.userId,
          createdByName: req.auth?.email,
          appOrigin,
        });
        customerUrl = link.url;
      } catch (linkErr) {
        logger.warn({ err: linkErr }, "customer link not created for share");
      }
      const share = await db.quotationShare.create({
        data: {
          quotationId: existing.id,
          channel,
          recipient: recipient || req.body?.recipient,
          senderName: req.auth?.email,
          message: req.body?.message,
          status: "Attempted",
          versionNumber: existing.currentVersion || 1,
        },
      });
      const link = customerUrl || `${appOrigin || ""}/?view=quotations&quoteId=${existing.id}`;
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Shared",
        details: recipient,
      });
      res.status(201).json({
        share,
        link,
        customerUrl,
        note: "Secure customer response link issued when send-eligible. Use /email or /whatsapp for PDF delivery.",
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Real customer email delivery (Phase 6) ────────────────────────────────
  app.post("/api/quotations/:id/email", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const result = await deliverQuotation({
        quotationId: paramId(req),
        channel: "Email",
        agencyScope: agencyScope(req),
        role: req.auth?.role,
        userId: req.auth?.userId,
        email: req.auth?.email,
        recipient: req.body?.recipient,
        message: req.body?.message,
        appOrigin: resolveAppOrigin(req.body?.appOrigin),
      });
      if (!result.ok) {
        res.status(result.configured ? 502 : 503).json({
          error: result.error,
          configured: result.configured,
          delivery: result.delivery,
          document: result.document,
        });
        return;
      }
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof QuotationDeliveryError || e instanceof QuotationPdfError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Real customer WhatsApp delivery (Phase 6) ─────────────────────────────
  app.post("/api/quotations/:id/whatsapp", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http");
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
      const publicBaseUrl = host ? `${proto}://${host}` : undefined;
      const result = await deliverQuotation({
        quotationId: paramId(req),
        channel: "WhatsApp",
        agencyScope: agencyScope(req),
        role: req.auth?.role,
        userId: req.auth?.userId,
        email: req.auth?.email,
        recipient: req.body?.recipient,
        message: req.body?.message,
        publicBaseUrl,
        appOrigin: resolveAppOrigin(req.body?.appOrigin),
      });
      if (!result.ok) {
        res.status(result.configured ? 502 : 503).json({
          error: result.error,
          configured: result.configured,
          delivery: result.delivery,
          document: result.document,
        });
        return;
      }
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof QuotationDeliveryError || e instanceof QuotationPdfError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Short-lived media fetch for Twilio WhatsApp (HMAC token; not a permanent public URL).
  app.get("/api/delivery-media/:token", async (req: AuthRequest, res: Response) => {
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : String(req.params.token || "");
      const parsed = verifyDeliveryMediaToken(token);
      if (!parsed) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const doc = await db.quotationDocument.findFirst({
        where: {
          id: parsed.documentId,
          quotationId: parsed.quotationId,
          visibility: "CUSTOMER",
          relatedEntity: "CUSTOMER_QUOTATION_PDF",
          storageKey: parsed.storageKey,
        },
      });
      if (!doc?.storageKey) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const buffer = await readPrivateObject(doc.storageKey);
      if (!buffer?.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.setHeader("Content-Type", doc.mimeType || "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${doc.fileName.replace(/"/g, "")}"`);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.status(200).send(buffer);
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Customer quotation PDF (server-side, Phase 4 storage) ─────────────────
  app.post("/api/quotations/:id/pdf", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const mode = String(req.body?.mode || req.query.mode || "customer") === "preview" ? "preview" : "customer";
      const result = await generateQuotationPdf({
        quotationId: paramId(req),
        agencyScope: agencyScope(req),
        role: req.auth?.role,
        userId: req.auth?.userId,
        email: req.auth?.email,
        mode,
      });
      await writeQuoteAudit({
        req,
        agencyId: result.agencyId,
        quotationId: result.quoteId,
        action: mode === "preview" ? "Quotation PDF Preview Generated" : "Quotation PDF Generated",
        updatedValue: { documentId: result.document.id, pages: result.pageCount, mode },
      });
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof QuotationPdfError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Mark converted (called after BMS proceed, or wrap) ───────────────────
  app.post("/api/quotations/:id/mark-converted", requireAuth, requirePermission("quotations"), async (_req: AuthRequest, res: Response) => {
    res.status(410).json({
      error: "This route cannot mark a quotation converted. Use POST /api/quotations/:id/proceed-to-booking, which creates the booking first.",
    });
  });

  // ── Agent package/trip quote UIs removed — use quotation wizard ───────────
  app.post("/api/quotations/agent/from-package", requireAuth, requirePermission("quotations"), async (_req: AuthRequest, res: Response) => {
    res.status(410).json({ error: "Removed. Create quotations via the quotation wizard." });
  });

  app.post("/api/quotations/agent/trip", requireAuth, requirePermission("quotations"), async (_req: AuthRequest, res: Response) => {
    res.status(410).json({ error: "Removed. Create quotations via the quotation wizard." });
  });

  // ── Agent: update customer details & markup ──────────────────────────────
  app.patch("/api/quotations/:id/agent", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (!isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Only travel agents can use this endpoint" });
        return;
      }
      const existing = await loadAgentQuote(req, agencyScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (["Converted to Booking", "Archived"].includes(existing.status)) {
        res.status(400).json({ error: "Cannot edit this quotation" });
        return;
      }

      const body = stripAgentPricingOverrides(req.body || {});
      const data: Record<string, unknown> = {};
      if (body.customerName != null) data.customerName = String(body.customerName).trim() || existing.customerName;
      if (body.contactPerson != null) data.contactPerson = body.contactPerson;
      if (body.contactEmail != null) data.contactEmail = body.contactEmail;
      if (body.contactPhone != null) data.contactPhone = body.contactPhone;
      if (body.specialRequests != null) data.specialRequests = body.specialRequests;
      if (body.travelStartDate != null) data.travelStartDate = body.travelStartDate;
      if (body.travelEndDate != null) data.travelEndDate = body.travelEndDate;
      if (body.travelStartDate != null) data.travelDates = body.travelStartDate;
      if (body.adults != null) data.adults = Number(body.adults);
      if (body.children != null) data.children = Number(body.children);
      if (body.infants != null) data.infants = Number(body.infants);

      const agentMarkup = body.agentMarkup != null ? Math.max(0, Math.round(Number(body.agentMarkup))) : (existing.agentMarkup || 0);
      const pkg = existing.packages.find((p) => p.isSelected) || existing.packages[0];
      if (pkg) {
        const priced = await priceFrozenPackage(pkg as unknown as Record<string, unknown>, {
          currency: existing.currency,
          nights: existing.nights,
          adults: body.adults ?? existing.adults,
          children: body.children ?? existing.children,
          infants: body.infants ?? existing.infants,
          trevioMarkupType: existing.trevioMarkupType,
          trevioMarkupValue: existing.trevioMarkupValue,
          agentMarkupType: body.agentMarkupType === "Percentage" ? "Percentage" : existing.agentMarkupType,
          agentMarkup,
          discountType: existing.discountType,
          discountValue: existing.discountValue,
          travelStartDate: body.travelStartDate ?? existing.travelStartDate,
          exchangeRate: existing.exchangeRate,
          exchangeRateExplicit: existing.exchangeRateExplicit,
          scope: catalogRateScope(req, agencyScope),
        });
        const layers = layersFromPackage(priced.priced);
        data.agentMarkup = agentMarkup;
        data.baseSellingTotal = layers.totalSelling;
        data.amount = layers.amount;
        data.gst = layers.gst;
        data.total = layers.total;
        data.perPersonCost = layers.perPersonCost;
        data.totalSelling = layers.totalSelling;
        data.totalNetCost = layers.totalNetCost;
        data.pricingStatus = priced.priced.unresolved ? "UNRESOLVED" : "OK";
        data.taxRate = priced.taxRate;
        await db.quotationPackage.update({
          where: { id: pkg.id },
          data: { ...packageWriteData(priced.frozen, layers), totalNetCost: layers.totalNetCost, grossProfit: layers.grossProfit, gst: layers.gst },
        });
      }

      await db.quotation.update({ where: { id: existing.id }, data });

      const after = await db.quotation.findUnique({ where: { id: existing.id }, include: QUOTE_INCLUDE });
      await recordQuotationRevisionIfNeeded({
        quotationId: existing.id,
        before: existing as unknown as Record<string, unknown>,
        after: (after || existing) as unknown as Record<string, unknown>,
        createdByName: req.auth?.email || "Agent",
        createdById: req.auth?.userId,
        changeSummary: "Agent update",
        reason: "agent_update",
      });

      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Agent Quote Updated",
        updatedValue: { agentMarkup, total: data.total ?? existing.total },
      });

      const full = await db.quotation.findUnique({ where: { id: existing.id }, include: QUOTE_INCLUDE });
      res.json({ quotation: sanitizeQuotationForRole(full as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Agent: request help (creates ops task) ───────────────────────────────
  app.post("/api/quotations/:id/request-help", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const quote = await db.quotation.findFirst({
        where: { id: paramId(req), deletedAt: null, ...agencyScope(req) },
      });
      if (!quote) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const helpType = String(req.body?.helpType || "Other").trim();
      const description = String(req.body?.description || "").trim();
      if (!description) {
        res.status(400).json({ error: "Please describe what help you need" });
        return;
      }
      const due = new Date();
      due.setDate(due.getDate() + 1);
      const task = await db.task.create({
        data: {
          agencyId: quote.agencyId,
          branchId: quote.branchId,
          title: `Quote help: ${helpType}`,
          description: `${quote.quoteNo} (${quote.destination || "trip"}) — ${description}`,
          assignedTo: "Operations",
          assignedBy: req.auth?.email || "Agent",
          department: "Operations",
          priority: "High",
          status: "To Do",
          dueDate: due.toISOString().slice(0, 10),
          relatedTo: quote.quoteNo,
        },
      });
      await notifyQuote({
        agencyId: quote.agencyId,
        title: "Quotation help requested",
        message: `${quote.quoteNo}: ${helpType}`,
        priority: "high",
      });
      await writeQuoteAudit({
        req,
        agencyId: quote.agencyId,
        quotationId: quote.id,
        action: "Help Requested",
        updatedValue: { helpType, description, taskId: task.id },
      });
      res.status(201).json({ task });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

function buildLineItemsFromPackages(packages: Array<{ name: string; total: number; hotels: unknown; flights: unknown }>) {
  const items: Array<{ description: string; qty: number; price: number; type?: string }> = [];
  for (const pkg of packages) {
    items.push({ description: `Package: ${pkg.name}`, qty: 1, price: pkg.total, type: "package" });
  }
  return items;
}
