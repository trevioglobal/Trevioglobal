/** Customer-safe quotation PDF model. Never includes contracted cost, markup, or supplier data. */

import { resolveDestinationTravelImages } from "./destination-images.js";

export type PdfAudience = "customer" | "agent" | "internal";
export type PdfMode = "preview" | "customer";

export type QuotationPdfPackage = {
  name: string;
  description?: string;
  hotels: Array<{
    hotelName: string;
    city?: string;
    starCategory?: string;
    roomType?: string;
    mealPlan?: string;
    checkIn?: string;
    checkOut?: string;
    nights?: number | string;
    address?: string;
    imageUrl?: string;
    highlight?: string;
    cancellationPolicy?: string;
    selfBooked?: boolean;
  }>;
  flights: Array<{
    airline?: string;
    flightNo?: string;
    from?: string;
    to?: string;
    date?: string;
    arrivalDate?: string;
    depTime?: string;
    arrTime?: string;
    duration?: string;
    stops?: number;
    cabin?: string;
    baggage?: string;
    aircraft?: string;
    sellingPrice?: number;
    currency?: string;
    /** one_way | round_trip | multi_city | outbound | return */
    tripType?: string;
    direction?: string;
  }>;
  transfers: Array<{
    transferType?: string;
    route?: string;
    vehicleType?: string;
    pickup?: string;
    drop?: string;
    date?: string;
    pickupTime?: string;
    duration?: string;
    pax?: number;
    remarks?: string;
    sellingPrice?: number;
    currency?: string;
    description?: string;
  }>;
  activities: Array<{
    activityName?: string;
    description?: string;
    date?: string;
    city?: string;
    duration?: string;
    timeSlot?: string;
    paxLabel?: string;
    ticketType?: string;
    sellingPrice?: number;
    currency?: string;
    imageUrl?: string;
  }>;
  meals: Array<{
    mealType?: string;
    restaurant?: string;
    location?: string;
    included?: boolean;
    date?: string;
    city?: string;
    description?: string;
    duration?: string;
    time?: string;
    paxLabel?: string;
    remarks?: string;
    voucher?: string;
    sellingPrice?: number;
    currency?: string;
  }>;
  addOns: Array<{
    name?: string;
    description?: string;
    date?: string;
    city?: string;
    quantity?: number;
    unitPrice?: number;
    sellingPrice?: number;
    currency?: string;
  }>;
  visa?: {
    enabled: boolean;
    visaType?: string;
    entryType?: string;
    processingTime?: string;
    documentsRequired?: string;
    appointmentRequired?: boolean;
    appointmentNote?: string;
    notes?: string;
    feeLabel?: string;
  } | null;
  insurance?: {
    enabled: boolean;
    provider?: string;
    planName?: string;
    coverage?: string;
    validity?: string;
    policyNumber?: string;
    notes?: string;
    premiumLabel?: string;
  } | null;
  itinerary: Array<{
    day?: number | string;
    title?: string;
    city?: string;
    date?: string;
    mealPlan?: string;
    coverImage?: string;
    places?: Array<{
      name?: string;
      description?: string;
      imageUrl?: string;
      bestTimeToVisit?: string;
      famousFor?: string;
    }>;
    items: Array<{ activityName?: string; description?: string; itemType?: string; pickupTime?: string }>;
  }>;
  inclusions: string[];
  exclusions: string[];
  /** Soft grouping of inclusion bullets for presentation only. */
  inclusionGroups: Array<{ label: string; items: string[] }>;
  /** Customer-facing selling totals by service (no cost/markup). */
  serviceTotals: Array<{ label: string; amount: number }>;
  pricing: {
    perAdultPrice: number;
    perChildPrice: number;
    packageBase: number;
    taxRate: number | null;
    taxAmount: number | null;
    taxConfigured: boolean;
    finalPrice: number;
    currency: string;
  };
};

export type QuotationPdfModel = {
  quoteNo: string;
  customerName: string;
  contactEmail?: string;
  contactPhone?: string;
  /** Short destination label for titles, e.g. "GOA". */
  destinationName: string;
  /** Display destination, may include country. */
  destination: string;
  country?: string;
  destinationDescription?: string;
  departureCity?: string;
  routeLabel?: string;
  landOnly?: boolean;
  travelDates: string;
  travelDatesShort?: string;
  letterDate: string;
  nightsLabel: string;
  adults: number;
  children: number;
  infants: number;
  paxSummary: string;
  hotelSummary?: string;
  /** Only set when flight selling totals exist and adults > 0. */
  flightCostPerPerson?: number;
  /** Only set when package base and flight totals allow a non-negative remainder. */
  landCostPerPerson?: number;
  coverImage?: string;
  closingImage?: string;
  /** Destination-only imagery for itinerary/fallback storytelling (never hotel rooms). */
  destinationImages: string[];
  specialRequests?: string;
  validTill?: string;
  paymentTerms?: string;
  cancellationPolicy?: string;
  refundPolicy?: string;
  termsAndConditions?: string;
  hotelTerms?: string;
  flightTerms?: string;
  visaTerms?: string;
  insuranceTerms?: string;
  forceMajeure?: string;
  travelDisclaimer?: string;
  visaNote?: string;
  insuranceNote?: string;
  salesContact?: string;
  /** Customer-facing agent / advisor name for cover & closing. */
  agentName: string;
  overviewNotes: string[];
  packages: QuotationPdfPackage[];
  branding: {
    brandName: string;
    legalName: string;
    logo?: string;
    watermark?: string;
    phone?: string;
    email?: string;
    address?: string;
    footerText?: string;
  };
  mode: PdfMode;
  audience: PdfAudience;
};

const SENSITIVE_KEYS = new Set([
  "costPrice",
  "quotedCostPrice",
  "contractedCost",
  "supplierCost",
  "supplier",
  "supplierId",
  "supplierRef",
  "supplierName",
  "trevioMarkup",
  "trevioMarkupType",
  "trevioMarkupValue",
  "trevioMarkupAmount",
  "trevioSellingPrice",
  "agentMarkup",
  "agentMarkupAmount",
  "agentMarkupType",
  "totalNetCost",
  "grossProfit",
  "profitMargin",
  "internalNotes",
  "internalRemarks",
  "remarks",
  "discountType",
  "discountValue",
  "discountAmount",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") as Record<string, unknown>[] : [];
}

function str(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function moneyNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function isImgUrl(value: unknown): boolean {
  const s = str(value);
  return /^(https?:\/\/|data:image\/|\/)/i.test(s);
}

function formatDates(quote: Record<string, unknown>): string {
  const start = str(quote.travelStartDate);
  const end = str(quote.travelEndDate);
  if (start && end) {
    const a = new Date(start);
    const b = new Date(end);
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())) return `${fmt(a)} – ${fmt(b)}`;
  }
  return str(quote.travelDates, "Dates as discussed");
}

function formatDatesShort(quote: Record<string, unknown>): string | undefined {
  const start = str(quote.travelStartDate);
  const end = str(quote.travelEndDate);
  if (!start || !end) return undefined;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return undefined;
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
  return `${fmt(a)} - ${fmt(b)}`;
}

function letterDate(quote: Record<string, unknown>): string {
  const raw = str(quote.updatedAt || quote.createdAt);
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function nightsLabel(quote: Record<string, unknown>, pkg: Record<string, unknown>): string {
  const hotels = asArr(pkg.hotels);
  const n = Number(quote.nights) || hotels.reduce((sum, h) => sum + Number(h.nights || 0), 0);
  const days = Number(quote.days) || (n ? n + 1 : 0);
  if (n && days) return `${n}N & ${days}D`;
  if (n) return `${n} nights`;
  return str(pkg.description, "Package");
}

function paxSummary(adults: number, children: number, infants: number): string {
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults}A`);
  if (children > 0) parts.push(`${children}C`);
  if (infants > 0) parts.push(`${infants} INFANT${infants === 1 ? "" : "S"}`);
  return parts.join("+") || "As discussed";
}

function hotelSummary(hotels: QuotationPdfPackage["hotels"]): string | undefined {
  if (!hotels.length) return undefined;
  return hotels.map((h) => {
    const star = h.starCategory ? ` (${String(h.starCategory).replace(/star/i, "").trim()} STAR)` : "";
    return `${h.hotelName.toUpperCase()}${star}`;
  }).join(" · ");
}

function packagePricing(pkg: Record<string, unknown>, quote: Record<string, unknown>): QuotationPdfPackage["pricing"] {
  const pricing = asRecord(pkg.pricing);
  const currency = str(quote.currency, "INR");
  if (pricing && (pricing.customerPrice != null || pricing.finalPrice != null)) {
    return {
      perAdultPrice: moneyNumber(pricing.perAdultPrice),
      perChildPrice: moneyNumber(pricing.perChildPrice),
      packageBase: moneyNumber(pricing.customerPrice),
      taxRate: pricing.taxRate == null ? null : Number(pricing.taxRate),
      taxAmount: pricing.taxAmount == null ? null : moneyNumber(pricing.taxAmount),
      taxConfigured: pricing.taxAmount != null,
      finalPrice: moneyNumber(pricing.finalPrice ?? pricing.customerPrice),
      currency,
    };
  }
  return {
    perAdultPrice: moneyNumber(quote.perPersonCost),
    perChildPrice: 0,
    packageBase: moneyNumber(quote.amount ?? quote.total),
    taxRate: Number(quote.taxRate) > 0 ? Number(quote.taxRate) : null,
    taxAmount: Number(quote.gst) > 0 ? moneyNumber(quote.gst) : null,
    taxConfigured: Number(quote.taxRate) > 0,
    finalPrice: moneyNumber(quote.total),
    currency,
  };
}

function mapHotels(rows: Record<string, unknown>[]) {
  return rows.map((h) => ({
    hotelName: str(h.hotelName, "Accommodation"),
    city: str(h.tripCity || h.city) || undefined,
    starCategory: str(h.starCategory) || undefined,
    roomType: str(h.roomType) || undefined,
    mealPlan: str(h.mealPlan) || undefined,
    checkIn: str(h.checkIn) || undefined,
    checkOut: str(h.checkOut) || undefined,
    nights: h.nights != null ? h.nights as number | string : undefined,
    address: str(h.address) || undefined,
    imageUrl: isImgUrl(h.imageUrl) ? str(h.imageUrl) : undefined,
    highlight: str(h.highlight || h.propertyHighlight || h.description || h.shortDescription) || undefined,
    cancellationPolicy: str(h.cancellationPolicy) || undefined,
    selfBooked: h.selfBooked === true || undefined,
  }));
}

function mapFlights(rows: Record<string, unknown>[]) {
  return rows.map((f) => {
    const selling = Number(f.sellingPrice ?? f.fare ?? 0);
    return {
      airline: str(f.airline) || undefined,
      flightNo: str(f.flightNo || f.flightNumber) || undefined,
      from: str(f.from) || undefined,
      to: str(f.to) || undefined,
      date: str(f.date) || undefined,
      arrivalDate: str(f.arrivalDate) || undefined,
      depTime: str(f.depTime) || undefined,
      arrTime: str(f.arrTime) || undefined,
      duration: str(f.duration) || undefined,
      stops: f.stops != null && f.stops !== "" ? Number(f.stops) : undefined,
      cabin: str(f.cabin || f.cabinClass) || undefined,
      baggage: str(f.baggage) || undefined,
      aircraft: str(f.aircraft) || undefined,
      sellingPrice: Number.isFinite(selling) && selling > 0 ? Math.round(selling) : undefined,
      currency: str(f.currency) || undefined,
      tripType: str(f.tripType) || undefined,
      direction: str(f.direction) || undefined,
    };
  });
}

function mapTransfers(rows: Record<string, unknown>[]) {
  return rows.map((t) => {
    const pickup = str(t.pickup) || undefined;
    const drop = str(t.drop) || undefined;
    const routeFromEnds = pickup && drop ? `${pickup} → ${drop}` : undefined;
    const selling = Number(t.sellingPrice);
    return {
      transferType: str(t.transferType) || undefined,
      route: str(t.route) || routeFromEnds || (str(t.from) && str(t.to) ? `${str(t.from)} – ${str(t.to)}` : undefined) || undefined,
      vehicleType: str(t.vehicleType) || undefined,
      pickup,
      drop,
      date: str(t.date) || undefined,
      pickupTime: str(t.pickupTime || t.time) || undefined,
      duration: str(t.duration) || undefined,
      pax: Number.isFinite(Number(t.pax)) && Number(t.pax) > 0 ? Math.round(Number(t.pax)) : undefined,
      remarks: str(t.remarks) || undefined,
      sellingPrice: Number.isFinite(selling) && selling > 0 ? Math.round(selling) : undefined,
      currency: str(t.currency) || undefined,
      description: str(t.description) || undefined,
    };
  });
}

function mapActivities(rows: Record<string, unknown>[]) {
  return rows.map((a) => {
    const adults = Number(a.adults);
    const children = Number(a.children);
    const paxParts = [
      Number.isFinite(adults) && adults > 0 ? `${Math.round(adults)} adult(s)` : "",
      Number.isFinite(children) && children > 0 ? `${Math.round(children)} child(ren)` : "",
    ].filter(Boolean);
    const selling = Number(a.sellingPrice);
    return {
      activityName: str(a.activityName || a.name) || undefined,
      description: str(a.description) || undefined,
      date: str(a.date) || undefined,
      city: str(a.city || a.tripCity) || undefined,
      duration: str(a.duration) || undefined,
      timeSlot: str(a.timeSlot || a.startTime || a.time) || undefined,
      paxLabel: paxParts.length ? paxParts.join(", ") : undefined,
      ticketType: str(a.ticketType) || undefined,
      sellingPrice: Number.isFinite(selling) && selling > 0 ? Math.round(selling) : undefined,
      currency: str(a.currency) || undefined,
      imageUrl: isImgUrl(a.imageUrl) ? str(a.imageUrl) : undefined,
    };
  });
}

function mapMeals(rows: Record<string, unknown>[]) {
  return rows
    .filter((m) => m.includedInPlan !== true && m.included !== true)
    .map((m) => {
      const adults = Number(m.adults);
      const children = Number(m.children);
      const infants = Number(m.infants);
      const paxParts = [
        Number.isFinite(adults) && adults > 0 ? `${Math.round(adults)} adult(s)` : "",
        Number.isFinite(children) && children > 0 ? `${Math.round(children)} child(ren)` : "",
        Number.isFinite(infants) && infants > 0 ? `${Math.round(infants)} infant(s)` : "",
      ].filter(Boolean);
      const selling = Number(m.sellingPrice);
      const fromAdultChild =
        (m.adultRate != null || m.childRate != null)
          ? Math.round(Number(m.adultRate || 0) * Number(m.adults || 0) + Number(m.childRate || 0) * Number(m.children || 0))
          : 0;
      const sellOut = Number.isFinite(selling) && selling > 0
        ? Math.round(selling)
        : (fromAdultChild > 0 ? fromAdultChild : undefined);
      return {
        mealType: str(m.mealType || m.name) || undefined,
        restaurant: str(m.restaurant) || undefined,
        location: str(m.location) || undefined,
        included: Boolean(m.included),
        date: str(m.date) || undefined,
        city: str(m.city || m.tripCity) || undefined,
        description: str(m.description) || undefined,
        duration: str(m.duration) || undefined,
        time: str(m.time || m.timeSlot) || undefined,
        paxLabel: paxParts.length ? paxParts.join(", ") : undefined,
        remarks: str(m.remarks) || undefined,
        voucher: str(m.voucher) || undefined,
        sellingPrice: sellOut,
        currency: str(m.currency) || undefined,
      };
    });
}

function mapAddOns(rows: Record<string, unknown>[]) {
  return rows
    .filter((a) => a.enabled !== false)
    .map((a) => {
      const selling = Number(a.sellingPrice);
      const qty = Math.max(1, Math.round(Number(a.quantity ?? 1) || 1));
      const sellOut = Number.isFinite(selling) && selling > 0 ? Math.round(selling) : undefined;
      const unitPrice = sellOut != null && qty > 0 ? Math.round(sellOut / qty) : undefined;
      return {
        name: str(a.name || a.title) || undefined,
        description: str(a.description) || undefined,
        date: str(a.date) || undefined,
        city: str(a.city || a.tripCity) || undefined,
        quantity: qty,
        unitPrice,
        sellingPrice: sellOut,
        currency: str(a.currency) || undefined,
      };
    });
}

function mapItinerary(rows: Record<string, unknown>[]) {
  return rows.map((day, i) => ({
    day: (typeof day.day === "string" || typeof day.day === "number" ? day.day : i + 1) as string | number,
    title: str(day.title) || undefined,
    city: str(day.city) || undefined,
    date: str(day.date) || undefined,
    mealPlan: str(day.mealPlan) || undefined,
    coverImage: isImgUrl(day.coverImage) ? str(day.coverImage) : undefined,
    places: asArr(day.places).map((p) => ({
      name: str(p.name) || undefined,
      description: str(p.description) || undefined,
      imageUrl: isImgUrl(p.imageUrl) ? str(p.imageUrl) : undefined,
      bestTimeToVisit: str(p.bestTimeToVisit) || undefined,
      famousFor: str(p.famousFor) || undefined,
    })).filter((p) => p.name),
    items: asArr(day.items)
      // Hide legacy auto-projected add-on lines; keep genuine manual MISC.
      .filter((it) => it.autoFromMisc !== true)
      .map((it) => ({
        activityName: str(it.activityName) || undefined,
        description: str(it.description) || undefined,
        itemType: str(it.itemType) || undefined,
        pickupTime: str(it.pickupTime) || undefined,
      })),
  }));
}

function mapVisa(raw: unknown): QuotationPdfPackage["visa"] {
  const visa = asRecord(raw);
  if (!visa || !visa.enabled) return null;
  const fee = moneyNumber(visa.sellingPrice ?? visa.premium);
  const currency = str(visa.currency, "INR") || "INR";
  return {
    enabled: true,
    visaType: str(visa.visaType) || undefined,
    entryType: str(visa.entryType) || undefined,
    processingTime: str(visa.processingTime) || undefined,
    documentsRequired: str(visa.documentsRequired) || undefined,
    appointmentRequired: Boolean(visa.appointmentRequired),
    appointmentNote: str(visa.appointmentNote) || undefined,
    notes: str(visa.notes || visa.remarks || visa.description) || undefined,
    feeLabel: fee > 0 ? `${currency} ${fee.toLocaleString("en-IN")}` : undefined,
  };
}

function mapInsurance(raw: unknown): QuotationPdfPackage["insurance"] {
  const insurance = asRecord(raw);
  if (!insurance || !insurance.enabled) return null;
  const premium = moneyNumber(insurance.premium ?? insurance.sellingPrice);
  const currency = str(insurance.currency, "INR") || "INR";
  return {
    enabled: true,
    provider: str(insurance.provider) || undefined,
    planName: str(insurance.planName) || undefined,
    coverage: str(insurance.coverage) || undefined,
    validity: str(insurance.validity) || undefined,
    policyNumber: str(insurance.policyNumber) || undefined,
    notes: str(insurance.notes || insurance.remarks || insurance.description) || undefined,
    premiumLabel: premium > 0 ? `${currency} ${premium.toLocaleString("en-IN")}` : undefined,
  };
}

function sumSelling(rows: Array<{ sellingPrice?: number }>): number {
  return rows.reduce((s, r) => s + (Number(r.sellingPrice) > 0 ? Math.round(Number(r.sellingPrice)) : 0), 0);
}

function groupInclusions(items: string[]): Array<{ label: string; items: string[] }> {
  if (!items.length) return [];
  const groups: Record<string, string[]> = {
    Hotel: [],
    Meals: [],
    Sightseeing: [],
    Transfers: [],
    "Other Services": [],
  };
  for (const raw of items) {
    const item = String(raw || "").trim();
    if (!item) continue;
    const lower = item.toLowerCase();
    if (/(hotel|accommodation|stay|room|night)/i.test(lower)) groups.Hotel.push(item);
    else if (/(meal|breakfast|lunch|dinner|bf\b|cuisine)/i.test(lower)) groups.Meals.push(item);
    else if (/(sight|tour|activity|entrance|ticket|guide|attraction)/i.test(lower)) groups.Sightseeing.push(item);
    else if (/(transfer|airport|vehicle|transport|pickup|drop)/i.test(lower)) groups.Transfers.push(item);
    else groups["Other Services"].push(item);
  }
  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }));
}

function mapPackage(pkg: Record<string, unknown>, quote: Record<string, unknown>): QuotationPdfPackage {
  const inclusions = Array.isArray(pkg.inclusions) && pkg.inclusions.length
    ? pkg.inclusions.map(String)
    : Array.isArray(quote.packageIncludes) ? (quote.packageIncludes as unknown[]).map(String) : [];
  const exclusions = Array.isArray(pkg.exclusions) && pkg.exclusions.length
    ? pkg.exclusions.map(String)
    : Array.isArray(quote.packageExcludes) ? (quote.packageExcludes as unknown[]).map(String) : [];
  const hotels = mapHotels(asArr(pkg.hotels));
  const flights = mapFlights(asArr(pkg.flights));
  const transfers = mapTransfers(asArr(pkg.transfers));
  const activities = mapActivities(asArr(pkg.activities));
  const meals = mapMeals(asArr(pkg.meals));
  const addOns = mapAddOns(asArr(pkg.addOns));
  const hotelSell = asArr(pkg.hotels).reduce((s, h) => {
    const n = Number(h.sellingPrice);
    return s + (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  }, 0);
  return {
    name: str(pkg.name, "Package"),
    description: str(pkg.description) || undefined,
    hotels,
    flights,
    transfers,
    activities,
    meals,
    addOns,
    visa: mapVisa(pkg.visa),
    insurance: mapInsurance(pkg.insurance),
    itinerary: mapItinerary(asArr(pkg.itinerary)),
    inclusions,
    exclusions,
    inclusionGroups: groupInclusions(inclusions),
    serviceTotals: [
      { label: "Hotels", amount: hotelSell },
      { label: "Flights", amount: sumSelling(flights) },
      { label: "Cars & Transfers", amount: sumSelling(transfers) },
      { label: "Activities", amount: sumSelling(activities) },
      { label: "Meals", amount: sumSelling(meals) },
      { label: "Add-ons", amount: sumSelling(addOns) },
    ].filter((r) => r.amount > 0),
    pricing: packagePricing(pkg, quote),
  };
}

function resolveAgentName(quote: Record<string, unknown>, brandingName: string): string {
  const candidates = [
    str(quote.agentName),
    str(quote.salesExecutiveName),
    str(quote.createdBy),
    brandingName,
    "Trevio Global",
  ].filter((v) => v && !/^undefined$/i.test(v) && !/^null$/i.test(v));
  return candidates[0] || "Trevio Global";
}

function buildOverviewNotes(quote: Record<string, unknown>, pkg: QuotationPdfPackage): string[] {
  const notes: string[] = [];
  const availability = str(quote.termsAndConditions);
  if (availability) notes.push(availability);
  else notes.push("Above quote is not blocked or booked. It is strictly subject to availability at the time of confirmation & booking.");

  if (pkg.pricing.taxConfigured && pkg.pricing.taxAmount != null && pkg.pricing.taxAmount > 0) {
    const rate = pkg.pricing.taxRate != null ? ` (${pkg.pricing.taxRate}%)` : "";
    notes.push(`Applicable tax${rate} is included as per quotation configuration.`);
  } else if (pkg.pricing.taxConfigured === false) {
    // omit fabricated GST claims when tax is not configured
  }

  const shareHint = str(quote.hotelTerms);
  if (shareHint) notes.push(shareHint);

  const disclaimer = str(quote.travelDisclaimer);
  if (disclaimer) notes.push(disclaimer);

  return notes.slice(0, 6);
}

/**
 * Derive optional land/flight per-person rows only when selling flight totals exist.
 * Never invents a split from a single all-in package price alone.
 */
function optionalLandFlightPerPerson(
  pkg: QuotationPdfPackage,
  adults: number,
): { landCostPerPerson?: number; flightCostPerPerson?: number } {
  if (adults <= 0) return {};
  const flightTotal = sumSelling(pkg.flights);
  if (flightTotal <= 0) return {};
  const flightCostPerPerson = Math.round(flightTotal / adults);
  const packageTotal = pkg.pricing.finalPrice || pkg.pricing.packageBase;
  if (packageTotal > flightTotal) {
    return {
      flightCostPerPerson,
      landCostPerPerson: Math.round((packageTotal - flightTotal) / adults),
    };
  }
  return { flightCostPerPerson };
}

export function assertCustomerSafeModel(model: QuotationPdfModel): string[] {
  const json = JSON.stringify(model);
  const leaks: string[] = [];
  for (const key of SENSITIVE_KEYS) {
    if (json.includes(`"${key}"`)) leaks.push(key);
  }
  if (/contracted cost/i.test(json)) leaks.push("contracted cost");
  if (/trevio markup/i.test(json)) leaks.push("trevio markup");
  if (/internal notes/i.test(json)) leaks.push("internal notes");
  return leaks;
}

export function buildQuotationPdfModel(input: {
  quote: Record<string, unknown>;
  branding?: {
    logo?: string | null;
    watermark?: string | null;
    footerText?: string | null;
    agencyName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  /** Destination hero / thumbnail when quote has no coverImage. */
  destinationCoverImage?: string | null;
  /** Additional destination gallery images for itinerary storytelling. */
  destinationImages?: string[] | null;
  /** Destination editorial copy when available in catalogue. */
  destinationDescription?: string | null;
  mode: PdfMode;
  audience: PdfAudience;
}): QuotationPdfModel {
  const quote = input.quote;
  const packages = asArr(quote.packages);
  const ordered = packages.length
    ? [...packages].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    : [{ name: "Standard", hotels: [], flights: [], transfers: [], activities: [], meals: [], itinerary: [], inclusions: [], exclusions: [] }];
  const first = ordered[0];
  const destinationName = str(quote.destination) || "Holiday";
  const dest = [destinationName, str(quote.country)].filter(Boolean).join(" · ") || "Holiday";
  const departureCity = str(quote.departureCity) || undefined;
  const mappedPackages = ordered.map((pkg) => mapPackage(pkg, quote));
  const primary = mappedPackages[0];
  const destinationImages = resolveDestinationTravelImages({
    destinationName,
    country: str(quote.country) || undefined,
    city: destinationName,
    catalogueImages: [
      ...(Array.isArray(input.destinationImages) ? input.destinationImages : []),
      input.destinationCoverImage,
    ],
  });
  const cover =
    (isImgUrl(quote.coverImage) && str(quote.coverImage))
    || destinationImages[0]
    || primary?.itinerary.find((d) => d.coverImage)?.coverImage
    || primary?.activities.find((a) => a.imageUrl)?.imageUrl
    // Hotel only as last resort for cover/closing — never preferred for itinerary.
    || primary?.hotels.find((h) => h.imageUrl)?.imageUrl
    || undefined;
  const branding = input.branding || {};
  const agencyName = str(branding.agencyName, "Trevio Global");
  const visa = asRecord(first.visa);
  const insurance = asRecord(first.insurance);
  const routeLabel = departureCity
    ? `${departureCity} → ${destinationName}`
    : destinationName;
  const adults = Math.max(0, Number(quote.adults ?? 0) || 0);
  const children = Math.max(0, Number(quote.children ?? 0) || 0);
  const infants = Math.max(0, Number(quote.infants ?? 0) || 0);
  const split = optionalLandFlightPerPerson(primary, adults);
  const destDesc = str(input.destinationDescription) || str(quote.destinationDescription) || undefined;

  return {
    quoteNo: str(quote.quoteNo, "QUOTE"),
    customerName: str(quote.customerName, "Traveller"),
    contactEmail: str(quote.contactEmail) || undefined,
    contactPhone: str(quote.contactPhone) || undefined,
    destinationName,
    destination: dest,
    country: str(quote.country) || undefined,
    destinationDescription: destDesc,
    departureCity,
    routeLabel,
    landOnly: quote.landOnly === true,
    travelDates: formatDates(quote),
    travelDatesShort: formatDatesShort(quote),
    letterDate: letterDate(quote),
    nightsLabel: nightsLabel(quote, first),
    adults,
    children,
    infants,
    paxSummary: paxSummary(adults, children, infants),
    hotelSummary: hotelSummary(primary?.hotels || []),
    flightCostPerPerson: split.flightCostPerPerson,
    landCostPerPerson: split.landCostPerPerson,
    coverImage: cover,
    closingImage: cover,
    destinationImages,
    specialRequests: str(quote.specialRequests) || undefined,
    validTill: str(quote.validTill) || undefined,
    paymentTerms: str(quote.paymentTerms) || undefined,
    cancellationPolicy: str(quote.cancellationPolicy) || undefined,
    refundPolicy: str(quote.refundPolicy) || undefined,
    termsAndConditions: str(quote.termsAndConditions) || undefined,
    hotelTerms: str(quote.hotelTerms) || undefined,
    flightTerms: str(quote.flightTerms) || undefined,
    visaTerms: str(quote.visaTerms) || undefined,
    insuranceTerms: str(quote.insuranceTerms) || undefined,
    forceMajeure: str(quote.forceMajeure) || undefined,
    travelDisclaimer: str(quote.travelDisclaimer) || undefined,
    visaNote: visa?.enabled
      ? (str(visa.notes || visa.description) || undefined)
      : (str(quote.visaNote) || undefined),
    insuranceNote: insurance?.enabled
      ? (str(insurance.notes || insurance.description) || undefined)
      : (str(quote.insuranceNote) || undefined),
    salesContact: [str(quote.salesExecutiveName || quote.createdBy), str(quote.salesExecutivePhone || quote.contactPhone)].filter(Boolean).join(" · ") || undefined,
    agentName: resolveAgentName(quote, agencyName),
    overviewNotes: buildOverviewNotes(quote, primary),
    packages: mappedPackages,
    branding: {
      brandName: agencyName,
      legalName: "TREVIO GLOBAL VOYAGE PRIVATE LIMITED",
      logo: isImgUrl(branding.logo) ? str(branding.logo) : undefined,
      watermark: isImgUrl(branding.watermark) ? str(branding.watermark) : undefined,
      phone: str(branding.phone) || undefined,
      email: str(branding.email) || undefined,
      address: str(branding.address) || undefined,
      footerText: str(branding.footerText) || agencyName,
    },
    mode: input.mode,
    audience: input.audience,
  };
}
