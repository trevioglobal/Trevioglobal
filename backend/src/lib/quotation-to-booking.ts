import type { Prisma } from "@prisma/client";
import { db } from "./db.js";
import { logger } from "./logger.js";
import {
  BOOKING_INCLUDE,
  nextBookingRef,
  notify,
  passengerSlotsFromRooms,
  writeAudit,
} from "./bms.js";
import { quoteConversionBlockReason } from "./quote-access.js";
import { quotePastValidityBlockReason } from "./quotation-expiry.js";
import { quoteAcceptedVersionBlockReason } from "./quotation-customer-access.js";
import { quoteUnresolvedRateReason } from "./contracted-rates.js";
import { TAX_CONFIGURATION_REQUIRED, pricingBlockReason } from "./pricing.js";
import { resolveCommissionAmount } from "./commission.js";
import { copyQuoteDocumentsToBooking } from "../routes/documents.js";
import { seedTravelDetailsFromPackage, seedTravelDetailsFromServices } from "./travel-details.js";
import { travelDatesBlockReason } from "./travel-dates.js";
import type { AuthRequest } from "../middleware/auth.js";

export class ConversionError extends Error {
  statusCode: number;
  booking?: unknown;
  code?: string;
  constructor(message: string, statusCode = 400, opts?: { booking?: unknown; code?: string }) {
    super(message);
    this.name = "ConversionError";
    this.statusCode = statusCode;
    this.booking = opts?.booking;
    this.code = opts?.code;
  }
}

/** Test-only failure injection points (never set in production). */
export type ConversionFailAfter =
  | "after_booking_create"
  | "after_services"
  | "before_claim"
  | null;

let testFailAfter: ConversionFailAfter = null;

export function setConversionTestFailAfter(value: ConversionFailAfter) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Conversion failure hooks are only available in test");
  }
  testFailAfter = value;
}

type Tx = Prisma.TransactionClient;

function jsonArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function packageHasCopiedLines(selected: {
  hotels: unknown;
  flights: unknown;
  transfers: unknown;
  activities: unknown;
  meals: unknown;
  itinerary: unknown;
  visa: unknown;
  insurance: unknown;
  addOns: unknown;
}) {
  const visa = selected.visa && typeof selected.visa === "object" ? (selected.visa as { enabled?: boolean }) : null;
  const ins = selected.insurance && typeof selected.insurance === "object" ? (selected.insurance as { enabled?: boolean }) : null;
  return (
    jsonArr(selected.hotels).length +
      jsonArr(selected.flights).length +
      jsonArr(selected.transfers).length +
      jsonArr(selected.activities).length +
      jsonArr(selected.meals).length +
      jsonArr(selected.itinerary).length +
      jsonArr(selected.addOns).length >
      0 ||
    Boolean(visa?.enabled) ||
    Boolean(ins?.enabled)
  );
}

function resolveSelectedPackage<T extends { id: string; isSelected: boolean; name: string }>(
  packages: T[],
  selectedPackageId: string | null | undefined,
): T {
  if (!packages.length) {
    throw new ConversionError("Quotation has no packages to convert", 400, { code: "NO_PACKAGE" });
  }
  if (packages.length === 1) return packages[0];
  const byId = selectedPackageId ? packages.find((p) => p.id === selectedPackageId) : undefined;
  if (byId) return byId;
  const flagged = packages.filter((p) => p.isSelected);
  if (flagged.length === 1) return flagged[0];
  throw new ConversionError(
    "Select one package on the accepted quotation before converting to a booking.",
    400,
    { code: "PACKAGE_SELECTION_REQUIRED" },
  );
}

function lineNote(line: Record<string, unknown>, extra: Array<string | number | undefined | null>) {
  return [...extra, line.remarks ? String(line.remarks) : ""].map((x) => (x == null ? "" : String(x))).filter(Boolean).join(" · ") || undefined;
}

async function copySelectedPackageToBookingTx(
  tx: Tx,
  bookingId: string,
  selected: {
    hotels: unknown;
    flights: unknown;
    transfers: unknown;
    activities: unknown;
    meals: unknown;
    itinerary: unknown;
    visa: unknown;
    insurance: unknown;
    addOns: unknown;
  },
) {
  async function svc(serviceType: string, title: string, line: Record<string, unknown>, notes?: string) {
    await tx.bookingService.create({
      data: {
        bookingId,
        serviceType,
        title: (title || serviceType).slice(0, 240),
        status: "Pending",
        costPrice: Math.round(Number(line.costPrice || line.contractedCost || 0)),
        quotedCostPrice: Math.round(Number(line.costPrice || line.contractedCost || 0)),
        sellingPrice: Math.round(Number(line.sellingPrice || line.fare || 0)),
        supplierName: line.supplier ? String(line.supplier) : undefined,
        confirmationNo: String(line.confirmationNumber || line.pnr || line.policyNumber || "") || undefined,
        voucherUrl: line.voucherUrl ? String(line.voucherUrl) : undefined,
        ticketUrl: line.ticketUrl ? String(line.ticketUrl) : undefined,
        notes,
      },
    });
  }

  for (const h of jsonArr(selected.hotels)) {
    const selfBooked = h.selfBooked === true || String(h.source || "") === "MANUAL";
    await svc("Hotel", String(h.hotelName || h.name || "Hotel"), h, lineNote(h, [
      selfBooked ? "Self-booked" : "",
      h.starCategory ? `${h.starCategory}*` : "",
      h.roomType ? String(h.roomType) : "",
      h.mealPlan ? String(h.mealPlan) : "",
      h.tripCity || h.city ? String(h.tripCity || h.city) : "",
      h.address ? `Address: ${h.address}` : "",
      h.checkIn && h.checkOut ? `${h.checkIn} → ${h.checkOut}` : "",
      h.nights != null && h.nights !== "" ? `${h.nights} nights` : "",
      h.rooms ? `${h.rooms} rooms` : "",
    ]));
  }
  for (const f of jsonArr(selected.flights)) {
    const paxBits = [
      f.adults != null ? `${f.adults} adult(s)` : "",
      f.children != null && Number(f.children) > 0 ? `${f.children} child(ren)` : "",
      f.infants != null && Number(f.infants) > 0 ? `${f.infants} infant(s)` : "",
    ].filter(Boolean);
    await svc("Flight", `${f.airline || "Flight"} ${f.flightNumber || f.flightNo || ""}`.trim(), f, lineNote(f, [
      f.from && f.to ? `${f.from} → ${f.to}` : "",
      f.date ? `Dep ${f.date}` : "",
      f.arrivalDate ? `Arr ${f.arrivalDate}` : "",
      f.depTime || f.arrTime ? `${f.depTime || ""}–${f.arrTime || ""}`.replace(/^–|–$/g, "") : "",
      f.duration ? String(f.duration) : "",
      f.stops != null && f.stops !== "" ? `${f.stops} stop(s)` : "",
      f.baggage ? `Baggage: ${f.baggage}` : "",
      f.cabinClass || f.cabin ? String(f.cabinClass || f.cabin) : "",
      f.source ? `Source: ${f.source}` : "",
      paxBits.length ? paxBits.join(", ") : "",
      f.pnr ? `PNR: ${f.pnr}` : "",
    ]));
  }
  for (const t of jsonArr(selected.transfers)) {
    await svc("Transfer", String(t.transferType || t.name || "Transfer"), t, lineNote(t, [
      t.transferType ? String(t.transferType) : "",
      t.vehicleType ? String(t.vehicleType) : "",
      t.pickup || t.drop ? `${t.pickup || ""} → ${t.drop || ""}`.replace(/^\s*→\s*|\s*→\s*$/g, "").trim() : "",
      t.date ? `Date ${t.date}` : "",
      t.pickupTime ? `Pickup ${t.pickupTime}` : "",
      t.duration ? `Duration ${t.duration}` : "",
      t.pax != null && t.pax !== "" ? `${t.pax} pax` : "",
      t.voucher ? `Voucher ${t.voucher}` : "",
      t.source ? `Source: ${t.source}` : "",
      t.currency ? String(t.currency) : "",
    ]));
  }
  for (const a of jsonArr(selected.activities)) {
    const paxBits = [
      a.adults != null && a.adults !== "" ? `${a.adults} adult(s)` : "",
      a.children != null && Number(a.children) > 0 ? `${a.children} child(ren)` : "",
    ].filter(Boolean);
    await svc("Attraction", String(a.activityName || a.name || "Activity"), a, lineNote(a, [
      a.city || a.tripCity ? `City ${a.city || a.tripCity}` : "",
      a.ticketType ? String(a.ticketType) : "",
      a.date ? `Date ${a.date}` : "",
      a.duration ? `Duration ${a.duration}` : "",
      a.timeSlot || a.startTime ? `Time ${a.timeSlot || a.startTime}` : "",
      paxBits.length ? paxBits.join(", ") : "",
      a.voucher ? `Voucher ${a.voucher}` : "",
      a.source ? `Source: ${a.source}` : "",
      a.description ? String(a.description) : "",
    ]));
  }
  for (const m of jsonArr(selected.meals)) {
    const paxBits = [
      m.adults != null && m.adults !== "" ? `${m.adults} adult(s)` : "",
      m.children != null && Number(m.children) > 0 ? `${m.children} child(ren)` : "",
      m.infants != null && Number(m.infants) > 0 ? `${m.infants} infant(s)` : "",
    ].filter(Boolean);
    await svc("Meal", `${m.mealType || "Meal"} ${m.restaurant || ""}`.trim(), m, lineNote(m, [
      m.city || m.tripCity ? `City ${m.city || m.tripCity}` : "",
      m.location ? String(m.location) : "",
      m.cuisine ? String(m.cuisine) : "",
      m.date ? `Date ${m.date}` : "",
      m.time ? `Time ${m.time}` : "",
      m.duration ? `Duration ${m.duration}` : "",
      paxBits.length ? paxBits.join(", ") : "",
      m.dietary ? `Dietary ${m.dietary}` : "",
      m.voucher ? `Voucher ${m.voucher}` : "",
      m.source ? `Source: ${m.source}` : "",
      m.description ? String(m.description) : "",
    ]));
  }
  const visa = selected.visa && typeof selected.visa === "object" ? (selected.visa as Record<string, unknown>) : null;
  if (visa?.enabled) {
    await svc("Visa", `Visa — ${visa.visaType || "Tourist"}`, visa, lineNote(visa, [
      visa.entryType ? String(visa.entryType) : "",
      visa.processingTime ? String(visa.processingTime) : "",
    ]));
  }
  const ins = selected.insurance && typeof selected.insurance === "object" ? (selected.insurance as Record<string, unknown>) : null;
  if (ins?.enabled) {
    await svc("Insurance", `${ins.provider || "Insurance"} ${ins.planName || ""}`.trim(), ins, lineNote(ins, [
      ins.coverage ? String(ins.coverage) : "",
      ins.validity ? String(ins.validity) : "",
    ]));
  }
  for (const day of jsonArr(selected.itinerary)) {
    const items = Array.isArray(day.items) ? (day.items as Array<{ activityName?: string; description?: string }>) : [];
    const notes = items.map((i) => i.activityName || i.description || "").filter(Boolean).join("; ");
    await svc("Other", String(day.title || `Day ${day.day || ""}`), { costPrice: 0, sellingPrice: 0 }, notes || undefined);
  }
  for (const a of jsonArr(selected.addOns)) {
    if (a.enabled === false) continue;
    await tx.bookingAddOn.create({
      data: {
        bookingId,
        addOnType: String(a.name || a.addOnType || "Other"),
        title: String(a.name || "Add-on"),
        amount: Math.round(Number(a.sellingPrice || 0)),
        costPrice: Math.round(Number(a.costPrice || 0)),
      },
    });
  }
}

const STANDARD_OPS = [
  { title: "Collect passenger details", department: "Operations", priority: "High" },
  { title: "Confirm hotel inventory", department: "Operations", priority: "High" },
  { title: "Issue tickets / vouchers", department: "Operations", priority: "Medium" },
  { title: "Verify PAN Card", department: "Operations", priority: "Medium" },
];

async function seedOpsTasksTx(tx: Tx, opts: {
  bookingId: string;
  bookingRef: string;
  agencyId?: string | null;
  branchId?: string | null;
  assignedBy: string;
  isInternational: boolean;
}) {
  const existingCount = await tx.task.count({ where: { bookingId: opts.bookingId } });
  if (existingCount > 0) return; // idempotent — do not duplicate on retry
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const dueDate = due.toISOString().slice(0, 10);
  const tasks = opts.isInternational ? STANDARD_OPS : STANDARD_OPS.filter((t) => t.title !== "Verify PAN Card");
  await tx.task.createMany({
    data: tasks.map((t) => ({
      agencyId: opts.agencyId ?? undefined,
      branchId: opts.branchId ?? undefined,
      bookingId: opts.bookingId,
      title: t.title,
      description: `Auto-created for booking ${opts.bookingRef}`,
      assignedTo: "Unassigned",
      assignedBy: opts.assignedBy,
      department: t.department,
      priority: t.priority,
      status: "Pending",
      dueDate,
      relatedTo: opts.bookingRef,
    })),
  });
}

async function seedDefaultServicesTx(
  tx: Tx,
  bookingId: string,
  opts: { isInternational: boolean; landOnly?: boolean },
) {
  const rows = [
    { serviceType: "Hotel", title: "Hotel accommodation" },
    ...(opts.landOnly ? [] : [{ serviceType: "Flight", title: "Flights" }]),
    { serviceType: "Transfer", title: "Airport transfers" },
    { serviceType: "Attraction", title: "Activities" },
    ...(opts.isInternational ? [{ serviceType: "Visa", title: "Visa processing" }] : []),
    { serviceType: "Insurance", title: "Travel insurance" },
  ];
  await tx.bookingService.createMany({
    data: rows.map((s) => ({
      bookingId,
      serviceType: s.serviceType,
      title: s.title,
      status: "Pending",
    })),
  });
}

function buildPricingSnapshot(quote: Record<string, unknown>, selected: Record<string, unknown>, versionNumber: number) {
  const pricing = (selected.pricing && typeof selected.pricing === "object" ? selected.pricing : {}) as Record<string, unknown>;
  return {
    source: "quotation_conversion",
    quoteNo: quote.quoteNo,
    quotationId: quote.id,
    acceptedVersionNumber: versionNumber,
    currentVersion: versionNumber,
    amount: quote.amount,
    gst: quote.gst,
    total: quote.total,
    totalNetCost: quote.totalNetCost,
    totalSelling: quote.totalSelling,
    grossProfit: quote.grossProfit,
    currency: quote.currency || "INR",
    taxRate: quote.taxRate,
    taxRuleId: quote.taxRuleId,
    couponCode: quote.couponCode,
    couponDiscount: quote.couponDiscount,
    agentMarkup: quote.agentMarkup,
    selectedPackageId: selected.id,
    selectedPackageName: selected.name,
    packagePricing: {
      contractedCost: pricing.contractedCost ?? selected.totalNetCost,
      customerPrice: pricing.customerPrice ?? pricing.finalPrice ?? selected.total,
      finalPrice: pricing.finalPrice ?? selected.total,
      taxAmount: pricing.taxAmount ?? selected.gst,
      taxRate: pricing.taxRate,
      trevioMarkupAmount: pricing.trevioMarkupAmount,
      currency: pricing.currency || quote.currency || "INR",
    },
    lockedAt: new Date().toISOString(),
  };
}

export type ConvertQuotationInput = {
  quotationId: string;
  agencyScope: Record<string, unknown>;
  ownAgencyId?: string | null;
  ownBranchId?: string | null;
  role?: string;
  userId?: string;
  email?: string;
  /** Optional travel date fill-ins only — never trusted for totals/status/version. */
  travelStartDate?: string;
  travelEndDate?: string;
  operationsExecutiveName?: string;
  operationsExecutiveId?: string;
  req?: AuthRequest;
};

export type ConvertQuotationResult = {
  booking: Awaited<ReturnType<typeof db.booking.findUnique>>;
  idempotent: boolean;
};

/**
 * Authoritative quotation → booking conversion.
 * Atomic: booking + services + passengers + documents + Converted status succeed or roll back together.
 */
export async function convertQuotationToBooking(input: ConvertQuotationInput): Promise<ConvertQuotationResult> {
  const quote = await db.quotation.findFirst({
    where: { id: input.quotationId, deletedAt: null, ...input.agencyScope },
    include: { packages: { orderBy: { sortOrder: "asc" } }, approvals: { orderBy: { createdAt: "asc" } } },
  });
  if (!quote) throw new ConversionError("Quotation not found", 404, { code: "NOT_FOUND" });

  // Idempotent return of existing conversion
  if (quote.status === "Converted to Booking") {
    const prior = quote.convertedBookingId
      ? await db.booking.findFirst({ where: { id: quote.convertedBookingId }, include: BOOKING_INCLUDE })
      : await db.booking.findFirst({ where: { quotationId: quote.id }, include: BOOKING_INCLUDE });
    if (prior) {
      return { booking: prior, idempotent: true };
    }
    throw new ConversionError("Quotation is Converted but booking record is missing", 409, { code: "ORPHAN_CONVERTED" });
  }

  if (quote.status === "Expired" || quotePastValidityBlockReason(quote)) {
    throw new ConversionError("Renew expired quotation before conversion", 400, { code: "EXPIRED" });
  }
  if (quote.status !== "Accepted") {
    throw new ConversionError("Quotation must be Accepted before proceeding to booking", 400, { code: "NOT_ACCEPTED" });
  }
  const versionBlock = quoteAcceptedVersionBlockReason(quote);
  if (versionBlock) throw new ConversionError(versionBlock, 409, { code: "VERSION_MISMATCH" });
  const approvalBlock = quoteConversionBlockReason(quote);
  if (approvalBlock) throw new ConversionError(approvalBlock, 403, { code: "APPROVAL_REQUIRED" });

  const unresolved = quoteUnresolvedRateReason(quote.packages as unknown as Array<Record<string, unknown>>)
    || (!quote.packages.length ? TAX_CONFIGURATION_REQUIRED : null)
    || quote.packages
      .map((pkg) => pkg.pricing as { unresolved?: boolean; reasons?: string[]; taxRequired?: boolean } | null)
      .map((pricing) => (!pricing || pricing.unresolved || pricing.taxRequired ? pricingBlockReason(pricing || { taxRequired: true }) : null))
      .find(Boolean);
  if (unresolved) throw new ConversionError(String(unresolved), 400, { code: "PRICING_UNRESOLVED" });
  if (!quote.customerName?.trim()) {
    throw new ConversionError("Customer name is required before conversion", 400, { code: "CUSTOMER_REQUIRED" });
  }

  const selected = resolveSelectedPackage(quote.packages, quote.selectedPackageId);
  const expectedVersion = quote.currentVersion || 1;
  if (quote.acceptedVersionNumber !== expectedVersion) {
    throw new ConversionError(
      `Acceptance was for version ${quote.acceptedVersionNumber}; current version is ${expectedVersion}.`,
      409,
      { code: "VERSION_MISMATCH" },
    );
  }

  const bodyStart = (input.travelStartDate || "").trim();
  const bodyEnd = (input.travelEndDate || "").trim();
  let travelStartDate = bodyStart || quote.travelStartDate || quote.travelDates || "";
  let travelEndDate = bodyEnd || quote.travelEndDate || "";
  if (!travelStartDate) {
    const hotels = Array.isArray(selected.hotels) ? (selected.hotels as Array<{ checkIn?: string; checkOut?: string }>) : [];
    travelStartDate = hotels[0]?.checkIn || "";
    travelEndDate = travelEndDate || hotels[0]?.checkOut || "";
  }
  if (!travelStartDate) {
    throw new ConversionError("Travel dates are required before conversion", 400, { code: "DATES_REQUIRED" });
  }
  const dateBlock = travelDatesBlockReason({
    travelStartDate,
    travelEndDate,
    requireStart: true,
  });
  if (dateBlock) {
    throw new ConversionError(dateBlock, 400, { code: "DATES_INVALID" });
  }

  // Authoritative commercial totals from DB quotation — ignore any client-supplied amounts.
  const packageValue = quote.total;
  const costPrice = Number(quote.totalNetCost || 0);
  if (costPrice <= 0 && packageValue > 0) {
    throw new ConversionError("Quotation contracted cost is unresolved. Reprice the quotation before conversion.", 400, {
      code: "COST_UNRESOLVED",
    });
  }
  const grossProfit = Number(quote.grossProfit || 0) || packageValue - costPrice;
  const adults = quote.adults ?? 2;
  const children = quote.children ?? 0;
  const infants = quote.infants ?? 0;
  const rooms = Math.max(1, Number(quote.rooms) || Math.ceil((adults + children) / 3));
  const salesName = quote.salesExecutiveName || quote.createdBy || input.email || "Sales";
  const opsName = input.operationsExecutiveName || "Operations";
  const opsId = input.operationsExecutiveId || undefined;

  const settings = quote.agencyId
    ? await db.settings.findUnique({ where: { agencyId: quote.agencyId }, select: { commissionRules: true } })
    : null;
  const commission = resolveCommissionAmount(packageValue, quote.service, settings?.commissionRules);
  const bookingRef = await nextBookingRef();
  const pricingSnapshot = buildPricingSnapshot(
    quote as unknown as Record<string, unknown>,
    selected as unknown as Record<string, unknown>,
    expectedVersion,
  );

  let createdBookingId: string | null = null;

  try {
    const booking = await db.$transaction(async (tx) => {
      const prior = await tx.booking.findFirst({ where: { quotationId: quote.id } });
      if (prior) {
        throw new ConversionError("Booking already exists for this quotation", 409, {
          booking: prior,
          code: "ALREADY_CONVERTED",
        });
      }

      // Optimistic lock: version + Accepted + not yet converted
      const stillValid = await tx.quotation.findFirst({
        where: {
          id: quote.id,
          status: "Accepted",
          currentVersion: expectedVersion,
          acceptedVersionNumber: expectedVersion,
          convertedBookingId: null,
          deletedAt: null,
        },
        select: { id: true, validTill: true, status: true },
      });
      if (!stillValid) {
        throw new ConversionError(
          "Quotation changed during conversion. Refresh and retry from the current accepted version.",
          409,
          { code: "STALE_VERSION" },
        );
      }
      if (quotePastValidityBlockReason(stillValid)) {
        throw new ConversionError("Renew expired quotation before conversion", 400, { code: "EXPIRED" });
      }

      if (bodyStart || bodyEnd) {
        await tx.quotation.update({
          where: { id: quote.id },
          data: {
            travelStartDate: travelStartDate || null,
            travelEndDate: travelEndDate || null,
            travelDates: travelStartDate || quote.travelDates,
          },
        });
      }

      if (testFailAfter === "before_claim") {
        throw new ConversionError("Forced conversion failure (test)", 500, { code: "TEST_FAIL" });
      }

      const created = await tx.booking.create({
        data: {
          bookingRef,
          customerName: quote.customerName,
          service: quote.service === "International" ? "Holiday" : (quote.service as string) || "Holiday",
          route: quote.destination || travelStartDate || "Package",
          travelDate: (travelStartDate || quote.travelDates || quote.validTill || "").slice(0, 32) || new Date().toISOString().slice(0, 10),
          amount: packageValue,
          commission,
          status: "Awaiting Passenger Details",
          paymentStatus: "Pending",
          agentId: quote.agentId || input.userId,
          agentName: quote.agentName || salesName,
          agencyId: input.ownAgencyId ?? quote.agencyId ?? undefined,
          agencyName: "",
          branchId: input.ownBranchId ?? quote.branchId ?? undefined,
          quotationId: quote.id,
          quoteNo: quote.quoteNo,
          quotationVersionNumber: expectedVersion,
          destination: quote.destination,
          nights: quote.nights,
          totalRooms: rooms,
          adults,
          children,
          infants,
          packageValue,
          amountPaid: 0,
          balanceAmount: packageValue,
          costPrice,
          grossProfit,
          netProfit: Math.round(grossProfit * 0.9),
          salesExecutiveId: quote.createdById ?? input.userId,
          salesExecutiveName: quote.salesExecutiveName || salesName,
          operationsExecutiveId: opsId,
          operationsExecutiveName: opsName,
          isInternational: quote.isInternational,
          pricingLocked: true,
          pricingSnapshot: pricingSnapshot as object,
          termsAndConditions: quote.termsAndConditions,
          paymentTerms: quote.paymentTerms,
          cancellationPolicy: quote.cancellationPolicy,
          packageIncludes: quote.packageIncludes ?? [],
          packageExcludes: quote.packageExcludes ?? [],
          currency: quote.currency || "INR",
        },
      });
      createdBookingId = created.id;

      if (testFailAfter === "after_booking_create") {
        throw new ConversionError("Forced conversion failure after booking create (test)", 500, { code: "TEST_FAIL" });
      }

      const claimed = await tx.quotation.updateMany({
        where: {
          id: quote.id,
          status: "Accepted",
          currentVersion: expectedVersion,
          acceptedVersionNumber: expectedVersion,
          convertedBookingId: null,
        },
        data: {
          status: "Converted to Booking",
          convertedBookingId: created.id,
          convertedAt: new Date(),
          convertedBy: input.email || "System",
          selectedPackageId: selected.id,
        },
      });
      if (claimed.count !== 1) {
        throw new ConversionError("Booking already exists for this quotation", 409, { code: "ALREADY_CONVERTED" });
      }

      const slots = passengerSlotsFromRooms(rooms, adults, children, infants);
      const nameParts = quote.customerName.trim().split(/\s+/);
      const passportFromNotes = String(quote.specialRequests || "").match(/^Passport:\s*(.+)$/im)?.[1]?.trim() || null;
      await tx.bookingPassenger.createMany({
        data: slots.map((s, idx) => ({
          bookingId: created.id,
          roomIndex: s.roomIndex,
          isLead: s.isLead,
          firstName: idx === 0 ? (nameParts[0] || "Lead") : "Passenger",
          lastName: idx === 0 ? (nameParts.slice(1).join(" ") || "Traveller") : String(idx + 1),
          // Lead guest details from quotation — no re-entry on booking Passengers tab
          ...(idx === 0
            ? {
                email: quote.contactEmail?.trim() || null,
                mobile: quote.contactPhone?.trim() || null,
                nationality: quote.nationality?.trim() || null,
                passportNumber: passportFromNotes,
              }
            : {}),
        })),
      });

      const hasPackageLines = packageHasCopiedLines(selected);
      if (!hasPackageLines) {
        await seedDefaultServicesTx(tx, created.id, {
          isInternational: quote.isInternational,
          landOnly: quote.landOnly === true,
        });
      } else {
        await copySelectedPackageToBookingTx(tx, created.id, selected);
      }

      if (testFailAfter === "after_services") {
        throw new ConversionError("Forced conversion failure after services (test)", 500, { code: "TEST_FAIL" });
      }

      const itinerary = jsonArr(selected.itinerary);
      const services = await tx.bookingService.findMany({ where: { bookingId: created.id } });
      const packageTravel = seedTravelDetailsFromPackage(selected);
      const serviceTravel = seedTravelDetailsFromServices(services);
      const travelDetails = {
        flights:
          packageTravel.flights && packageTravel.flights.length
            ? packageTravel.flights
            : serviceTravel.flights || [],
        hotel:
          packageTravel.hotel?.name || packageTravel.hotel?.checkIn
            ? packageTravel.hotel
            : serviceTravel.hotel || {},
      };
      await tx.booking.update({
        where: { id: created.id },
        data: {
          itinerary: itinerary.length > 0 ? (itinerary as object) : undefined,
          travelDetails: (travelDetails.flights.length > 0 || travelDetails.hotel?.name)
            ? (travelDetails as object)
            : services.length > 0
              ? (serviceTravel as object)
              : undefined,
        },
      });

      await seedOpsTasksTx(tx, {
        bookingId: created.id,
        bookingRef,
        agencyId: created.agencyId,
        branchId: created.branchId,
        assignedBy: input.email || "System",
        isInternational: quote.isInternational,
      });

      await copyQuoteDocumentsToBooking(quote.id, created.id, tx);

      if (quote.leadId) {
        await tx.lead.updateMany({
          where: { id: quote.leadId, agencyId: created.agencyId ?? undefined },
          data: { stage: "Won" },
        });
      }

      return created;
    }, {
      maxWait: 5000,
      timeout: 20000,
    });

    await writeAudit({
      req: input.req,
      agencyId: booking.agencyId,
      bookingId: booking.id,
      action: "Proceed to Booking",
      details: `Created ${bookingRef} from ${quote.quoteNo} v${expectedVersion}`,
      updatedValue: {
        bookingRef,
        quotationId: quote.id,
        quotationVersionNumber: expectedVersion,
        acceptedVersionNumber: expectedVersion,
      },
    });
    await notify({
      agencyId: booking.agencyId,
      title: "Booking Created",
      message: `${bookingRef} created from quotation ${quote.quoteNo}`,
      priority: "high",
    });

    const full = await db.booking.findUnique({ where: { id: booking.id }, include: BOOKING_INCLUDE });
    return { booking: full, idempotent: false };
  } catch (e) {
    if (e instanceof ConversionError) throw e;
    // Unique constraint race on quotationId
    const prismaErr = e as { code?: string };
    if (prismaErr.code === "P2002") {
      const prior = await db.booking.findFirst({ where: { quotationId: quote.id }, include: BOOKING_INCLUDE });
      if (prior) return { booking: prior, idempotent: true };
      throw new ConversionError("Booking already exists for this quotation", 409, { code: "ALREADY_CONVERTED" });
    }
    logger.error({ err: e, quotationId: quote.id, createdBookingId }, "quotation conversion failed");
    throw e;
  }
}

/** Data consistency helpers for audits (read-only). */
export async function auditConversionConsistency(agencyId?: string) {
  const whereAgency = agencyId ? { agencyId } : {};
  const convertedWithoutBooking = await db.quotation.findMany({
    where: {
      ...whereAgency,
      status: "Converted to Booking",
      OR: [
        { convertedBookingId: null },
        { convertedBookingId: { not: null } },
      ],
    },
    select: { id: true, quoteNo: true, convertedBookingId: true, status: true },
    take: 200,
  });
  const orphans: typeof convertedWithoutBooking = [];
  for (const q of convertedWithoutBooking) {
    if (!q.convertedBookingId) {
      orphans.push(q);
      continue;
    }
    const b = await db.booking.findFirst({ where: { id: q.convertedBookingId } });
    if (!b) orphans.push(q);
  }
  const bookingsWithoutQuoteRef = await db.booking.count({
    where: { ...whereAgency, quotationId: null, quoteNo: { not: null } },
  });
  const duplicateBookings = await db.$queryRaw<Array<{ quotationId: string; cnt: bigint }>>`
    SELECT "quotationId", COUNT(*)::bigint AS cnt
    FROM "Booking"
    WHERE "quotationId" IS NOT NULL
    GROUP BY "quotationId"
    HAVING COUNT(*) > 1
  `;
  return {
    convertedWithoutBooking: orphans,
    bookingsWithQuoteNoButNoId: bookingsWithoutQuoteRef,
    duplicateQuotationBookings: duplicateBookings.map((r) => ({
      quotationId: r.quotationId,
      count: Number(r.cnt),
    })),
  };
}
