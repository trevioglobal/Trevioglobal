/** Display-only costing. Server `pricePackage` is the source of truth on save. */

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

/** Sum optional catalog prices on itinerary day places (SightseeingPlace). */
export function sumItinerarySightseeing(itinerary: unknown): { cost: number; selling: number } {
  if (!Array.isArray(itinerary)) return { cost: 0, selling: 0 };
  let cost = 0;
  let selling = 0;
  for (const day of itinerary) {
    const places = (day as { places?: unknown })?.places;
    if (!Array.isArray(places)) continue;
    for (const place of places) {
      const row = place as CostLine;
      const t = lineTotals({
        sellingPrice: row.sellingPrice,
        costPrice: row.costPrice,
        qty: 1,
      });
      cost += t.cost;
      selling += t.selling;
    }
  }
  return { cost, selling };
}

export function calcPackageCosting(pkg: {
  hotels?: unknown;
  flights?: unknown;
  transfers?: unknown;
  activities?: unknown;
  meals?: unknown;
  addOns?: unknown;
  itinerary?: unknown;
  visa?: { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null;
  insurance?: {
    enabled?: boolean;
    costPrice?: number;
    sellingPrice?: number;
    premium?: number;
  } | null;
  taxRate?: number;
  discountType?: string | null;
  discountValue?: number;
  trevioMarkupValue?: number;
  adults?: number;
  children?: number;
  infants?: number;
}) {
  const hotels = sumServiceLines(pkg.hotels);
  const flights = sumServiceLines(pkg.flights);
  const transfers = sumServiceLines(pkg.transfers);
  const activities = sumServiceLines(pkg.activities);
  const meals = sumServiceLines(pkg.meals);
  const sightseeing = sumItinerarySightseeing(pkg.itinerary);
  const addOnLines = Array.isArray(pkg.addOns)
    ? pkg.addOns.filter((row) => (row as { enabled?: boolean }).enabled !== false)
    : [];
  const addOns = sumServiceLines(addOnLines);

  const visa = pkg.visa?.enabled
    ? { cost: Number(pkg.visa.costPrice || 0), selling: Number(pkg.visa.sellingPrice || 0) }
    : { cost: 0, selling: 0 };
  const insurance = pkg.insurance?.enabled
    ? {
        cost: Number(pkg.insurance.costPrice || 0),
        selling: Number(pkg.insurance.premium ?? pkg.insurance.sellingPrice ?? 0),
      }
    : { cost: 0, selling: 0 };

  const services: Array<{ key: string; label: string; netCost: number; sellingPrice: number }> = [
    { key: "hotels", label: "Hotels", netCost: hotels.cost, sellingPrice: hotels.selling },
    { key: "flights", label: "Flights", netCost: flights.cost, sellingPrice: flights.selling },
    { key: "transfers", label: "Transfers", netCost: transfers.cost, sellingPrice: transfers.selling },
    { key: "activities", label: "Activities", netCost: activities.cost, sellingPrice: activities.selling },
    { key: "sightseeing", label: "Sightseeing", netCost: sightseeing.cost, sellingPrice: sightseeing.selling },
    { key: "meals", label: "Meals", netCost: meals.cost, sellingPrice: meals.selling },
    { key: "visa", label: "Visa", netCost: visa.cost, sellingPrice: visa.selling },
    { key: "insurance", label: "Insurance", netCost: insurance.cost, sellingPrice: insurance.selling },
    { key: "addOns", label: "Add-ons", netCost: addOns.cost, sellingPrice: addOns.selling },
  ];

  let totalNetCost = services.reduce((s, row) => s + row.netCost, 0);
  let totalSellingBeforeDiscount = services.reduce((s, row) => s + row.sellingPrice, 0);
  const trevioMarkupAmount = Math.round(totalNetCost * (Number(pkg.trevioMarkupValue || 0) / 100));
  if (trevioMarkupAmount > 0) {
    totalSellingBeforeDiscount += trevioMarkupAmount;
  }

  let discountAmount = 0;
  if (pkg.discountType === "Percentage") {
    discountAmount = Math.round(totalSellingBeforeDiscount * (Number(pkg.discountValue || 0) / 100));
  } else if (pkg.discountType === "Fixed") {
    discountAmount = Math.round(Number(pkg.discountValue || 0));
  }
  discountAmount = Math.min(discountAmount, totalSellingBeforeDiscount);
  const afterDiscount = totalSellingBeforeDiscount - discountAmount;
  const taxRate = Number(pkg.taxRate ?? 0);
  const gst = taxRate > 0 ? Math.round(afterDiscount * (taxRate / 100)) : 0;
  const taxableAmount = Math.max(0, afterDiscount - gst);
  const finalPackageCost = afterDiscount;
  const grossProfit = afterDiscount - totalNetCost;
  const profitMargin = afterDiscount > 0 ? (grossProfit / afterDiscount) * 100 : 0;
  const pax = Math.max(1, Number(pkg.adults || 0) + Number(pkg.children || 0));
  const perPersonCost = Math.round(finalPackageCost / pax);

  return {
    services,
    totalNetCost,
    totalSellingBeforeDiscount,
    totalSelling: afterDiscount,
    grossProfit,
    profitMargin: Math.round(profitMargin * 100) / 100,
    discountAmount,
    taxableAmount,
    gst,
    taxRate,
    total: finalPackageCost,
    finalPackageCost,
    perPersonCost,
    trevioMarkupAmount,
  };
}

export type ResolvedQuoteCosting = {
  packageBase: number;
  gst: number;
  total: number;
  taxRate: number;
  totalNetCost: number;
  grossProfit: number;
  profitMargin: number;
  perPersonCost: number;
  discountAmount: number;
  perAdultPrice: number;
  perChildPrice: number;
  trevioSellingPrice?: number;
  trevioMarkupAmount?: number;
  agentMarkupAmount?: number;
  taxConfigured?: boolean;
  adults: number;
  children: number;
  infants: number;
  roomCount: number;
  checkIn?: string;
  checkOut?: string;
  source: "packages" | "stored" | "derived";
};

/** Fallback only, when a stored pricing layer is not available. Equal split across adults and children; infants are not given an invented rate. */
export function derivePaxRates(packageBase: number, adults: number, children: number) {
  const a = Math.max(0, Number(adults) || 0);
  const c = Math.max(0, Number(children) || 0);
  const paying = a + c;
  if (paying <= 0) return { perAdultPrice: 0, perChildPrice: 0 };
  const perAdultPrice = Math.round(packageBase / paying);
  const perChildPrice = c > 0 ? perAdultPrice : 0;
  return { perAdultPrice, perChildPrice };
}

function roomCountFromHotels(hotels: unknown, adults: number, children: number): number {
  if (Array.isArray(hotels) && hotels.length) {
    const sum = hotels.reduce((s, h) => s + (Number((h as { rooms?: number }).rooms) || 0), 0);
    if (sum > 0) return sum;
  }
  return Math.max(1, Math.ceil((Math.max(0, adults) + Math.max(0, children)) / 3));
}

/** Normalize quote/hotel values to YYYY-MM-DD. Rejects check-in times like "14:00" / "11:00am". */
export function toCalendarDate(value?: string | null): string {
  if (!value) return "";
  const v = String(value).trim();
  if (!v) return "";
  if (/^\d{1,2}:\d{2}/.test(v) || /am|pm/i.test(v)) return "";
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || v.length < 8) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isCalendarDate(value?: string): boolean {
  return Boolean(toCalendarDate(value));
}

function hotelDates(hotels: unknown): { checkIn?: string; checkOut?: string } {
  if (!Array.isArray(hotels) || !hotels.length) return {};
  let checkIn: string | undefined;
  let checkOut: string | undefined;
  for (const hotel of hotels) {
    const row = hotel as {
      checkIn?: string;
      checkOut?: string;
      checkInDate?: string;
      checkOutDate?: string;
    };
    const cin = toCalendarDate(row.checkIn) || toCalendarDate(row.checkInDate);
    const cout = toCalendarDate(row.checkOut) || toCalendarDate(row.checkOutDate);
    if (!checkIn && cin) checkIn = cin;
    if (cout) checkOut = cout;
  }
  return { checkIn, checkOut };
}

/**
 * Prefer live package lines; else stored DB fields; else derive from amount/gst/total
 * so older quotes (zeros for net/profit) still show a sensible breakdown.
 */
export function resolveQuotationCosting(quote: {
  amount?: number;
  gst?: number;
  total?: number;
  taxRate?: number;
  totalNetCost?: number | null;
  grossProfit?: number | null;
  profitMargin?: number | null;
  perPersonCost?: number | null;
  discountAmount?: number | null;
  discountType?: string | null;
  discountValue?: number;
  trevioMarkupValue?: number;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  travelStartDate?: string | null;
  travelEndDate?: string | null;
  packages?: Array<Record<string, unknown>> | null;
}): ResolvedQuoteCosting {
  const adults = Math.max(0, Number(quote.adults ?? 2));
  const children = Math.max(0, Number(quote.children ?? 0));
  const infants = Math.max(0, Number(quote.infants ?? 0));
  const taxRate = Number(quote.taxRate ?? 0);
  const packages = Array.isArray(quote.packages) ? quote.packages : [];
  const selected =
    packages.find((p) => p.isSelected) ||
    packages[0] ||
    null;

  const storedPricing = selected?.pricing as {
    contractedCost?: number;
    trevioMarkupAmount?: number;
    trevioSellingPrice?: number;
    customerPrice?: number;
    taxAmount?: number | null;
    taxRate?: number | null;
    finalPrice?: number | null;
    perAdultPrice?: number;
    perChildPrice?: number;
    discountAmount?: number;
    agentMarkupAmount?: number;
    unresolved?: boolean;
  } | null;
  if (storedPricing && (storedPricing.contractedCost != null || storedPricing.customerPrice != null)) {
    const dates = hotelDates(selected?.hotels);
    return {
      packageBase: Number(storedPricing.customerPrice ?? 0),
      gst: Number(storedPricing.taxAmount ?? 0),
      total: Number(storedPricing.finalPrice ?? storedPricing.customerPrice ?? 0),
      taxRate: Number(storedPricing.taxRate ?? 0),
      totalNetCost: Number(storedPricing.contractedCost ?? 0),
      grossProfit: Number(storedPricing.trevioSellingPrice ?? 0) - Number(storedPricing.contractedCost ?? 0),
      profitMargin: 0,
      perPersonCost: Number(storedPricing.perAdultPrice ?? 0),
      discountAmount: Number(storedPricing.discountAmount ?? 0),
      perAdultPrice: Number(storedPricing.perAdultPrice ?? 0),
      perChildPrice: Number(storedPricing.perChildPrice ?? 0),
      trevioSellingPrice: Number(storedPricing.trevioSellingPrice ?? 0),
      trevioMarkupAmount: Number(storedPricing.trevioMarkupAmount ?? 0),
      agentMarkupAmount: Number(storedPricing.agentMarkupAmount ?? 0),
      taxConfigured: storedPricing.taxAmount != null,
      adults,
      children,
      infants,
      roomCount: roomCountFromHotels(selected?.hotels, adults, children),
      checkIn: dates.checkIn || toCalendarDate(quote.travelStartDate) || undefined,
      checkOut: dates.checkOut || toCalendarDate(quote.travelEndDate) || undefined,
      source: "stored",
    };
  }

  if (selected) {
    const live = calcPackageCosting({
      hotels: selected.hotels,
      flights: selected.flights,
      transfers: selected.transfers,
      activities: selected.activities,
      meals: selected.meals,
      addOns: selected.addOns,
      itinerary: selected.itinerary,
      visa: selected.visa as { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null,
      insurance: selected.insurance as {
        enabled?: boolean;
        costPrice?: number;
        sellingPrice?: number;
        premium?: number;
      } | null,
      taxRate,
      discountType: quote.discountType || null,
      discountValue: Number(quote.discountValue || 0),
      trevioMarkupValue: Number(quote.trevioMarkupValue || 0),
      adults,
      children,
      infants,
    });
    if (live.total > 0 || live.totalNetCost > 0) {
      const packageBase = live.taxableAmount > 0 ? live.taxableAmount : Math.max(0, live.total - live.gst);
      const rates = derivePaxRates(packageBase, adults, children);
      const dates = hotelDates(selected.hotels);
      return {
        packageBase,
        gst: live.gst,
        total: live.total,
        taxRate,
        totalNetCost: live.totalNetCost,
        grossProfit: live.grossProfit,
        profitMargin: live.profitMargin,
        perPersonCost: live.perPersonCost,
        discountAmount: live.discountAmount,
        trevioMarkupAmount: live.trevioMarkupAmount,
        trevioSellingPrice: live.totalSellingBeforeDiscount,
        ...rates,
        adults,
        children,
        infants,
        roomCount: roomCountFromHotels(selected.hotels, adults, children),
        checkIn: dates.checkIn || toCalendarDate(quote.travelStartDate) || undefined,
        checkOut: dates.checkOut || toCalendarDate(quote.travelEndDate) || undefined,
        source: "packages",
      };
    }
  }

  const storedNet = Number(quote.totalNetCost || 0);
  const storedTotal = Number(quote.total || 0);
  const storedGst = Number(quote.gst || 0);
  const storedAmount = Number(quote.amount || 0);
  const exclusive = storedTotal > 0 && storedAmount > 0 && storedAmount + storedGst === storedTotal;
  const packageBase = exclusive
    ? storedAmount
    : storedAmount > storedGst
      ? Math.max(0, (storedAmount || storedTotal) - storedGst)
      : Math.max(0, storedTotal - storedGst);
  const total = storedTotal || packageBase + storedGst;
  const gst = storedGst || Math.round(packageBase * (taxRate / 100));

  let totalNetCost = storedNet;
  let grossProfit = Number(quote.grossProfit || 0);
  let profitMargin = Number(quote.profitMargin || 0);
  let perPersonCost = Number(quote.perPersonCost || 0);
  let source: ResolvedQuoteCosting["source"] = "stored";

  if (totalNetCost <= 0 && packageBase > 0) {
    source = "stored";
  }
  if ((grossProfit === 0 || quote.grossProfit == null) && packageBase > 0) {
    grossProfit = packageBase - totalNetCost;
    if (storedNet <= 0) source = "derived";
  }
  if ((profitMargin === 0 || quote.profitMargin == null) && packageBase > 0) {
    profitMargin = Math.round((grossProfit / packageBase) * 10000) / 100;
  }
  if (perPersonCost <= 0) {
    const pax = Math.max(1, adults + children);
    perPersonCost = Math.round((exclusive ? packageBase : total) / pax);
    if (!quote.perPersonCost) source = "derived";
  }

  const rates = derivePaxRates(packageBase, adults, children);
  return {
    packageBase,
    gst,
    total,
    taxRate,
    totalNetCost,
    grossProfit,
    profitMargin,
    perPersonCost,
    discountAmount: Number(quote.discountAmount || 0),
    ...rates,
    adults,
    children,
    infants,
    roomCount: roomCountFromHotels(selected?.hotels, adults, children),
    checkIn: toCalendarDate(quote.travelStartDate) || undefined,
    checkOut: toCalendarDate(quote.travelEndDate) || undefined,
    source,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isoNightsPreview(checkIn: unknown, checkOut: unknown): number | null {
  const a = String(checkIn || "");
  const b = String(checkOut || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b <= a) return null;
  const ms = new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function previewLineCost(line: Record<string, unknown>, nights: number | null, adults: number, children: number, infants: number): number | null {
  if (line.includedInPlan === true || line.included === true) return 0;
  const snap = asRecord(line.rateSnapshot);
  const unit = typeof snap?.contractedCost === "number" ? Math.round(snap.contractedCost) : typeof line.costPrice === "number" ? Math.round(line.costPrice) : typeof line.fare === "number" ? Math.round(line.fare) : null;
  if (unit == null && line.selfBooked === true) return 0;
  if (unit == null) return null;
  const rateUnit = String(snap?.rateUnit || "");
  const qty = Math.max(1, Math.round(Number(line.quantity ?? line.qty ?? 1) || 1));
  if (rateUnit === "PER_ROOM_NIGHT" || (snap && line.productType === "HOTEL") || line.productType === "HOTEL") {
    const rooms = Math.round(Number(line.rooms ?? 0) || 0);
    // Prefer hotel-line stay nights (city window) over quote-level total nights.
    const lineStay =
      isoNightsPreview(line.checkIn, line.checkOut)
      ?? (Math.round(Number(line.nights) || 0) > 0 ? Math.round(Number(line.nights)) : 0);
    const stay = lineStay > 0 ? lineStay : (nights && nights > 0 ? nights : 0);
    if (rooms <= 0 || stay <= 0) return null;
    const meta = asRecord(snap?.metadata);
    const child = typeof meta?.childCost === "number" ? meta.childCost * children * stay : 0;
    const infant = typeof meta?.infantCost === "number" ? meta.infantCost * infants * stay : 0;
    return unit * rooms * stay + child + infant;
  }
  if (rateUnit === "PER_VEHICLE" || rateUnit === "PER_TRANSFER" || (snap && line.productType === "TRANSFER")) {
    const capacity = Math.round(Number(line.capacity ?? 0) || 0);
    const pax = adults + children + infants;
    const vehicles = capacity > 0 ? Math.max(1, Math.ceil(pax / capacity)) * qty : qty;
    return unit * vehicles;
  }
  if (rateUnit === "PER_ACTIVITY" || rateUnit === "PER_MEAL" || rateUnit === "PER_SERVICE") {
    return unit * qty;
  }
  if (!snap && (line.source === "AMADEUS_API" || line.source === "API" || line.source === "MANUAL")) return unit;
  const meta = asRecord(snap?.metadata);
  const childRate = typeof meta?.childCost === "number" ? meta.childCost : 0;
  const infantRate = typeof meta?.infantCost === "number" ? meta.infantCost : 0;
  return (unit * adults + childRate * children + infantRate * infants) * qty;
}

/** Staff preview only. Final amounts are recalculated on the server from the rate snapshot. */
export function previewPackageLayers(input: {
  hotels?: unknown;
  flights?: unknown;
  transfers?: unknown;
  activities?: unknown;
  meals?: unknown;
  adults?: number;
  children?: number;
  infants?: number;
  nights?: number | null;
  trevioMarkupValue?: number;
  agentMarkup?: number;
  agentMarkupType?: string;
  discountType?: string | null;
  discountValue?: number;
}) {
  const adults = Math.max(0, Number(input.adults || 0));
  const children = Math.max(0, Number(input.children || 0));
  const infants = Math.max(0, Number(input.infants || 0));
  let contracted = 0;
  let unresolved = false;
  for (const rows of [input.hotels, input.flights, input.transfers, input.activities, input.meals]) {
    if (!Array.isArray(rows)) continue;
    for (const raw of rows) {
      const line = asRecord(raw);
      if (!line) continue;
      const cost = previewLineCost(line, input.nights ?? null, adults, children, infants);
      if (cost == null) unresolved = true;
      else contracted += cost;
    }
  }
  const markup = Math.round(contracted * (Number(input.trevioMarkupValue || 0) / 100));
  let selling = contracted + markup;
  let discountAmount = 0;
  if (input.discountType === "Percentage") discountAmount = Math.min(selling, Math.round(selling * (Number(input.discountValue || 0) / 100)));
  else if (input.discountType === "Fixed") discountAmount = Math.min(selling, Math.round(Number(input.discountValue || 0)));
  selling -= discountAmount;
  const agentAmount = input.agentMarkupType === "Percentage"
    ? Math.round(selling * (Number(input.agentMarkup || 0) / 100))
    : Math.max(0, Math.round(Number(input.agentMarkup || 0)));
  const customer = selling + agentAmount;
  const paying = adults + children;
  return {
    totalNetCost: contracted,
    totalSelling: selling,
    grossProfit: selling - contracted,
    profitMargin: selling > 0 ? Math.round(((selling - contracted) / selling) * 10000) / 100 : 0,
    discountAmount,
    taxableAmount: customer,
    gst: 0,
    total: customer,
    perPersonCost: paying > 0 ? Math.round(customer / paying) : 0,
    trevioMarkupAmount: markup,
    agentMarkupAmount: agentAmount,
    unresolved,
  };
}
