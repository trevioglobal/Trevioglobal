/** Transfer catalogue helpers for Malaysia / KTH rate sheets. */

export const MALAYSIA_TRANSFER_CITIES = ["Kuala Lumpur", "Langkawi", "Penang"] as const;

const TRANSFER_IMAGE =
  "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=800&q=80";

export function transferPlaceholderImage(): string {
  return TRANSFER_IMAGE;
}

/** Map a free-text trip city to the nearest KTH transfer hub. */
export function resolveTransferHubCity(city: string): string {
  const key = city.trim().toLowerCase();
  if (!key) return "Kuala Lumpur";
  if (key.includes("langkawi")) return "Langkawi";
  if (key.includes("penang") || key.includes("georgetown") || key.includes("george town")) return "Penang";
  // Genting transfers live on the KL sheet (KLIA / KL Hotel ↔ Genting Hotel).
  if (key.includes("genting")) return "Kuala Lumpur";
  // Default Malaysia hub for KL / Melaka / Alor Gajah / JB / etc.
  return "Kuala Lumpur";
}

/** True when the day city is Genting (hub stays KL, products filtered by name). */
export function isGentingDayCity(city: string): boolean {
  return /genting/i.test(String(city || "").trim());
}

/** Search query for Airport Pickup products by day / hotel city. */
export function airportPickupSearchQuery(dayCity: string): string {
  const hub = resolveTransferHubCity(dayCity);
  if (hub === "Langkawi") return "Langkawi Airport";
  if (hub === "Penang") return "Penang Airport";
  return "Kuala Lumpur Airport";
}

/** Same airport hub search — used for Hotel → Airport drop products. */
export function airportDropSearchQuery(dayCity: string): string {
  return airportPickupSearchQuery(dayCity);
}

/**
 * Airport → Hotel products for the day's hub.
 * - KL / Genting → curated KLIA list (Genting destinations included)
 * - Langkawi / Penang → local airport → hotel one-ways
 */
export function matchesAirportPickupForDayCity(
  item: {
    name?: string | null;
    pickupLocation?: string | null;
    dropLocation?: string | null;
  },
  dayCity: string,
): boolean {
  if (!isAirportToHotelTransfer(item)) return false;
  const hub = resolveTransferHubCity(dayCity);
  const hay = [item.name, item.pickupLocation, item.dropLocation]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");

  if (hub === "Langkawi") {
    return /langkawi\s*airport/.test(hay) && /langkawi|hotel|beach|north|datai|st regis/.test(hay);
  }
  if (hub === "Penang") {
    return /penang.*airport|airport.*penang|airport.*hotel or vice versa/.test(hay);
  }

  // KL hub — curated KLIA list; when day is Genting, keep Genting destinations only.
  if (!matchesMalaysiaKlAirportTransferList(item)) return false;
  if (isGentingDayCity(dayCity)) {
    return /genting/.test(hay);
  }
  return true;
}

/**
 * Hotel → Airport products for the day's hub (Airport Drop).
 */
export function matchesAirportDropForDayCity(
  item: {
    name?: string | null;
    pickupLocation?: string | null;
    dropLocation?: string | null;
  },
  dayCity: string,
): boolean {
  if (!isHotelToAirportTransfer(item)) return false;
  const hub = resolveTransferHubCity(dayCity);
  const hay = [item.name, item.pickupLocation, item.dropLocation]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");

  if (hub === "Langkawi") {
    return /langkawi\s*airport/.test(hay);
  }
  if (hub === "Penang") {
    return /penang.*airport|airport.*penang|airport.*hotel or vice versa/.test(hay);
  }

  if (!/kuala lumpur airport|klia/.test(hay)) return false;
  if (isGentingDayCity(dayCity)) {
    return /genting/.test(hay);
  }
  return true;
}

/**
 * Regular transfer list for a trip day.
 * Genting days filter KL-hub products that mention Genting; other hubs keep city match.
 */
export function transferMatchesDayCity(
  item: {
    name?: string | null;
    city?: string | null;
    pickupLocation?: string | null;
    dropLocation?: string | null;
  },
  dayCity: string,
): boolean {
  const needle = String(dayCity || "").trim();
  if (!needle) return true;
  const hay = [item.name, item.city, item.pickupLocation, item.dropLocation]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");

  if (isGentingDayCity(needle)) {
    return /genting/.test(hay);
  }

  const hub = resolveTransferHubCity(needle).toLowerCase();
  const itemCity = String(item.city || "").toLowerCase();
  if (itemCity && (itemCity === hub || itemCity.includes(hub) || hub.includes(itemCity))) {
    return true;
  }
  return hay.includes(hub) || hay.includes(needle.toLowerCase());
}

/** Hotels to bind for Airport Pickup on a given service day / city. */
export function hotelsForAirportPickupDay(
  hotels: Array<Record<string, unknown>>,
  opts: { serviceDate?: string; dayCity?: string },
): Array<Record<string, unknown>> {
  const date = String(opts.serviceDate || "").trim();
  const cityNeedle = String(opts.dayCity || "").trim().toLowerCase();

  const covering = hotels.filter((h) => {
    const cin = String(h.checkIn || "");
    const cout = String(h.checkOut || "");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(cin)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(cout)) return date >= cin && date < cout;
      return date === cin;
    }
    return false;
  });
  if (covering.length) return covering;

  if (cityNeedle) {
    const byCity = hotels.filter((h) => {
      const hc = String(h.tripCity || h.city || "").toLowerCase();
      return hc === cityNeedle || hc.includes(cityNeedle) || cityNeedle.includes(hc);
    });
    if (byCity.length) return byCity;
  }
  return [];
}

export function isAirportTransfer(item: {
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
  transferType?: string | null;
}): boolean {
  const hay = [item.name, item.pickupLocation, item.dropLocation, item.transferType]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return /airport|klia/.test(hay);
}

/**
 * Airport Pickup = one-way from Airport → Hotel (KTH sheet).
 * Hotel → Airport drops are excluded (those belong under Airport Drop).
 */
export function isAirportToHotelTransfer(item: {
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}): boolean {
  const name = String(item.name || "");
  const pickup = String(item.pickupLocation || "").toLowerCase();
  const drop = String(item.dropLocation || "").toLowerCase();

  // Penang local: "Airport - Hotel or Vice Versa"
  if (/airport.*hotel or vice versa/i.test(name)) return true;

  if (/airport|klia/.test(pickup) && /hotel/.test(drop)) return true;

  // Name pattern: "from … Airport - … Hotel"
  const m = name.match(/from\s+(.+?)\s+-\s+(.+)$/i);
  if (m) {
    const from = m[1].toLowerCase();
    const to = m[2].toLowerCase();
    if (/airport|klia/.test(from) && /hotel/.test(to)) return true;
  }
  return false;
}

/**
 * Airport Drop = one-way from Hotel → Airport.
 * Bidirectional Penang products count for both pick and drop.
 */
export function isHotelToAirportTransfer(item: {
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}): boolean {
  const name = String(item.name || "");
  const pickup = String(item.pickupLocation || "").toLowerCase();
  const drop = String(item.dropLocation || "").toLowerCase();

  if (/airport.*hotel or vice versa/i.test(name)) return true;

  if (/hotel/.test(pickup) && /airport|klia/.test(drop)) return true;

  const m = name.match(/from\s+(.+?)\s+-\s+(.+)$/i);
  if (m) {
    const from = m[1].toLowerCase();
    const to = m[2].toLowerCase();
    if (/hotel/.test(from) && /airport|klia/.test(to)) return true;
  }

  // Name may be "… Hotel - … Airport" without "from"
  if (/hotel/.test(name) && /airport|klia/.test(name) && !isAirportToHotelTransfer(item)) {
    return /hotel.+(airport|klia)|(to\s+).*(airport|klia)/i.test(name);
  }
  return false;
}

/** @deprecated Prefer isAirportToHotelTransfer for Airport Pickup. */
export function isAirportPickupTransfer(item: {
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}): boolean {
  return isAirportToHotelTransfer(item);
}

/**
 * Map selected hotel city → KTH destination keywords in transfer drop/name
 * (e.g. "Malacca Hotel", "Genting Hotel").
 */
export function resolveAirportHotelDestinationKeys(hotelCity: string): string[] {
  const key = hotelCity.trim().toLowerCase();
  if (!key) return ["kuala lumpur hotel"];
  if (/genting/.test(key)) return ["genting hotel"];
  if (/malacca|melaka|alor gajah/.test(key)) return ["malacca hotel"];
  if (/port dickson/.test(key)) return ["port dickson hotel"];
  if (/ipoh|tambun/.test(key)) return ["ipoh", "tambun"];
  if (/cameron/.test(key)) return ["cameron highland"];
  if (/penang|georgetown|george town/.test(key)) return ["penang hotel"];
  if (/johor|jb\b/.test(key)) return ["johor bahru hotel"];
  if (/singapore/.test(key)) return ["singapore hotel"];
  if (/langkawi/.test(key)) return ["langkawi hotel"];
  // KL metro + default Malaysia hub destinations
  return ["kuala lumpur hotel"];
}

/** True when this Airport→Hotel product matches the selected hotel's city. */
export function matchesAirportPickupForHotel(
  item: {
    name?: string | null;
    pickupLocation?: string | null;
    dropLocation?: string | null;
  },
  hotelCity: string,
): boolean {
  if (!isAirportToHotelTransfer(item)) return false;
  const keys = resolveAirportHotelDestinationKeys(hotelCity);
  const hay = [item.dropLocation, item.name]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return keys.some((k) => hay.includes(k));
}

export type TransferVehicleOption = {
  id: string;
  vehicleType: string;
  label: string;
  paxLabel: string;
  price: number;
};

function vehicleColumnLabel(type: string): string {
  if (/guide/i.test(type)) return "18 SEATER + GUIDE";
  if (/18/.test(type)) return "18-SEATER";
  if (/10/.test(type)) return "10-SEATER";
  return "CAR";
}

function vehiclePaxLabel(type: string, seats?: number): string {
  if (/guide/i.test(type) || /18/.test(type)) return "7-13 Pax";
  if (/10/.test(type)) return "4-6 Pax";
  if (seats && seats > 0) return `1-${seats} Pax`;
  return "1-3 Pax";
}

/** Vehicle columns from KTH sheet (Car / 10 / 18 / 18+Guide). */
export function getTransferVehicleOptions(item: {
  vehiclePricing?: unknown;
  privatePrice?: number | null;
  sharedPrice?: number | null;
  vehicleType?: string | null;
}): TransferVehicleOption[] {
  const raw = Array.isArray(item.vehiclePricing) ? item.vehiclePricing : [];
  const fromSheet = raw
    .map((row, index) => {
      const r = row as Record<string, unknown>;
      const vehicleType = String(r.vehicleType || "").trim();
      const price = Number(r.price ?? 0);
      if (!vehicleType || !(price > 0)) return null;
      return {
        id: `${vehicleType}-${index}`,
        vehicleType,
        label: vehicleColumnLabel(vehicleType),
        paxLabel: vehiclePaxLabel(vehicleType, Number(r.seats) || undefined),
        price,
      } satisfies TransferVehicleOption;
    })
    .filter(Boolean) as TransferVehicleOption[];

  if (fromSheet.length) return fromSheet;

  const fallback = Number(item.privatePrice ?? item.sharedPrice ?? 0);
  if (fallback > 0) {
    const vehicleType = String(item.vehicleType || "Sedan / Car");
    return [{
      id: "fallback-car",
      vehicleType,
      label: vehicleColumnLabel(vehicleType),
      paxLabel: vehiclePaxLabel(vehicleType),
      price: fallback,
    }];
  }
  return [];
}

/** Malaysia airport-transfer capacity bands (KTH sheet). */
export type MalaysiaVehicleBand = "car" | "van10" | "van18" | "van18Guide";

export function classifyMalaysiaVehicleBand(vehicleType: string): MalaysiaVehicleBand | null {
  const t = vehicleType.toLowerCase();
  if (/guide/.test(t)) return "van18Guide";
  if (/18/.test(t)) return "van18";
  if (/10/.test(t)) return "van10";
  if (/car|sedan/.test(t)) return "car";
  return null;
}

/** Max seat capacity for itinerary display (e.g. "Van 10-seater" → 10). */
export function vehicleCapacityMax(vehicleType: string, seats?: number): number | null {
  const fromSeats = Math.round(Number(seats) || 0);
  if (fromSeats > 0) return fromSeats;
  const seater = String(vehicleType || "").match(/(\d+)\s*-?\s*seater/i);
  if (seater) return Number(seater[1]);
  const band = classifyMalaysiaVehicleBand(vehicleType);
  if (band === "van18" || band === "van18Guide") return 18;
  if (band === "van10") return 10;
  if (band === "car") return 3;
  return null;
}

/** Guide is mandatory for 8–13 pax on airport transfer (use 18-SEATER + GUIDE). */
export function isAirportGuideMandatory(pax: number): boolean {
  return pax >= 8 && pax <= 13;
}

/**
 * Required vehicle band for passenger count.
 * Returns null when pax < 1; "over_capacity" when pax > 13.
 */
export function requiredVehicleBandForPax(pax: number): MalaysiaVehicleBand | "over_capacity" | null {
  const n = Math.floor(Number(pax) || 0);
  if (n < 1) return null;
  if (n <= 3) return "car";
  if (n <= 6) return "van10";
  if (n === 7) return "van18";
  if (n <= 13) return "van18Guide";
  return "over_capacity";
}

export function validateAirportVehicleForPax(
  vehicleType: string,
  pax: number,
): { ok: boolean; message?: string; requiredBand?: MalaysiaVehicleBand | "over_capacity" | null } {
  const required = requiredVehicleBandForPax(pax);
  if (!(Math.floor(Number(pax) || 0) >= 1)) {
    return { ok: false, message: "Passenger count is required.", requiredBand: required };
  }
  if (!String(vehicleType || "").trim()) {
    return { ok: false, message: "Vehicle is required.", requiredBand: required };
  }
  // Agents may book any KTH column; band match is advisory in the UI only.
  return { ok: true, requiredBand: required };
}

/** Keep only the vehicle(s) allowed for this pax count (exactly one band). */
export function filterVehiclesForAirportPax(
  options: TransferVehicleOption[],
  pax: number,
): TransferVehicleOption[] {
  const required = requiredVehicleBandForPax(pax);
  if (!required || required === "over_capacity") return [];
  return options.filter((opt) => classifyMalaysiaVehicleBand(opt.vehicleType) === required);
}

/** Whether this vehicle column matches the suggested KTH band for pax (advisory). */
export function isVehicleAllowedForAirportPax(vehicleType: string, pax: number): boolean {
  const required = requiredVehicleBandForPax(pax);
  if (!required || required === "over_capacity") return false;
  return classifyMalaysiaVehicleBand(vehicleType) === required;
}

/** Estimate customer-facing INR from contracted INR + Trevio markup (preview). */
export function estimateCustomerInrPrice(
  contractedInr: number,
  markup?: { type?: string; value?: number },
): number {
  const base = Math.max(0, Math.round(Number(contractedInr) || 0));
  const value = Number(markup?.value || 0);
  if (!(value > 0)) return base;
  if (markup?.type === "Fixed") return base + Math.round(value);
  return base + Math.round((base * value) / 100);
}

/** Malaysia hotel catalogue cities only (sheet inventory). */
export const MALAYSIA_HOTEL_CITIES = ["Kuala Lumpur", "Genting Highlands", "Langkawi"] as const;

export function isMalaysiaHotelCatalogueCity(city: string): boolean {
  const key = city.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return false;
  return MALAYSIA_HOTEL_CITIES.some((c) => {
    const catalog = c.toLowerCase();
    return key === catalog || key.includes(catalog) || catalog.includes(key) || (key.includes("genting") && catalog.includes("genting"));
  });
}

export function normalizeMalaysiaHotelCity(city: string): (typeof MALAYSIA_HOTEL_CITIES)[number] | null {
  const key = city.trim().toLowerCase();
  if (!key) return null;
  if (key.includes("langkawi")) return "Langkawi";
  if (key.includes("genting")) return "Genting Highlands";
  if (key.includes("kuala lumpur") || key === "kl") return "Kuala Lumpur";
  return isMalaysiaHotelCatalogueCity(city)
    ? (MALAYSIA_HOTEL_CITIES.find((c) => c.toLowerCase() === key) || null)
    : null;
}


/**
 * Curated KL Airport → Hotel destinations (KTH sheet) — Airport Pickup list only.
 * Hotel → Airport routes belong under regular Transfers / drop, not this list.
 */
export const MALAYSIA_KL_AIRPORT_TO_HOTEL_DESTINATIONS = [
  "One Way Transfer from Kuala Lumpur Airport - Port Dickson Hotel",
  "One Way Transfer from Kuala Lumpur Airport - Ipoh / Tambun Hotel",
  "One Way Transfer from Kuala Lumpur Airport - Cameron Highland Hotel",
  "One Way Transfer from Kuala Lumpur Airport - Penang Hotel",
  "One Way Transfer from Kuala Lumpur Airport - Johor Bahru Hotel",
  "One Way Transfer from Kuala Lumpur Airport - Singapore Hotel",
  "One Way Transfer from Kuala Lumpur Airport - Kuala Lumpur Hotel (6am - 11pm)",
  "One Way Transfer from Kuala Lumpur Airport - Kuala Lumpur Hotel (11.01pm - 5.59am)",
  "One Way Transfer from Kuala Lumpur Airport - Kuala Lumpur Hotel + Enroute Putrajaya (30Mins)",
  "One Way Transfer from Kuala Lumpur Airport - Kuala Lumpur Hotel + Enroute Putrajaya (60Mins)",
  "One Way Transfer from Kuala Lumpur Airport - Genting Hotel + Enroute Batu Caves (30Mins)",
  "One Way Transfer from Kuala Lumpur Airport - Genting Hotel + Enroute Batu Caves (60Mins)",
  "One Way Transfer from Kuala Lumpur Airport - Genting Hotel + Enroute Putrajaya (30Mins) + Enroute Batu Caves (30Mins)",
  "One Way Transfer from Kuala Lumpur Airport - Malacca Hotel",
] as const;

/** @deprecated Use MALAYSIA_KL_AIRPORT_TO_HOTEL_DESTINATIONS */
export const MALAYSIA_KL_AIRPORT_TRANSFER_DESTINATIONS = MALAYSIA_KL_AIRPORT_TO_HOTEL_DESTINATIONS;

/** Normalize catalogue / UI destination titles for comparison. */
export function normalizeTransferDestinationName(name: string): string {
  return String(name || "")
    .replace(/Enrote/gi, "Enroute")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+-\s+/g, " - ")
    .trim();
}

function destinationMatchKey(name: string): string {
  return normalizeTransferDestinationName(name)
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when product is Airport → Hotel on the curated KL Airport DESTINATION list.
 * Explicitly excludes Hotel → Airport (reverse) routes.
 */
export function matchesMalaysiaKlAirportTransferList(item: {
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}): boolean {
  if (!isAirportToHotelTransfer(item)) return false;
  const key = destinationMatchKey(String(item.name || ""));
  if (!key.includes("kuala lumpur airport")) return false;
  // Must start from airport, not hotel.
  if (!/^one way transfer from kuala lumpur airport\b/.test(key)) return false;

  return MALAYSIA_KL_AIRPORT_TO_HOTEL_DESTINATIONS.some((dest) => {
    const destKey = destinationMatchKey(dest);
    if (key === destKey) return true;
    if (key.startsWith(destKey)) return true;
    // Genting + Putrajaya + Batu Caves variants in catalogue.
    if (
      destKey.includes("genting hotel")
      && key.includes("genting hotel")
      && key.includes("from kuala lumpur airport")
    ) {
      return true;
    }
    return false;
  });
}

/** Generic sheet drop labels (not a real booked property name). */
export function isGenericCityHotelAirportTransfer(item: {
  name?: string | null;
  dropLocation?: string | null;
}): boolean {
  const name = destinationMatchKey(String(item.name || ""));
  const drop = destinationMatchKey(String(item.dropLocation || ""));
  if (/kuala lumpur hotel/.test(name) || drop === "kuala lumpur hotel") return true;
  if (/^one way transfer from kuala lumpur airport - genting hotel/.test(name)) return true;
  if (/^one way transfer from kuala lumpur airport - malacca hotel$/.test(name)) return true;
  if (/^one way transfer from langkawi airport - langkawi hotel/.test(name)) return true;
  return false;
}

/** Airport hub label for a hotel city. */
export function resolveAirportLabelForHotelCity(hotelCity: string): string {
  const hub = resolveTransferHubCity(hotelCity);
  if (hub === "Langkawi") return "Langkawi Airport";
  if (hub === "Penang") return "Penang Airport";
  return "Kuala Lumpur Airport";
}

/**
 * Pick the best catalogue Airport → city-hotel product to price a booked hotel transfer.
 * Prefers daytime KL hotel rate over overnight / enroute extras.
 */
export function findBaseAirportTransferForHotelCity<T extends {
  id?: string;
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}>(products: T[], hotelCity: string): T | null {
  const keys = resolveAirportHotelDestinationKeys(hotelCity);
  const scored = products
    .filter((p) => isAirportToHotelTransfer(p))
    .map((p) => {
      const hay = `${p.name || ""} ${p.dropLocation || ""}`.toLowerCase();
      if (!keys.some((k) => hay.includes(k))) return null;
      const name = String(p.name || "").toLowerCase();
      let score = 1;
      if (/6am|6 am/.test(name)) score += 4;
      if (/11\.01|5\.59|night/.test(name)) score -= 1;
      if (/enroute|enrote|batu caves|putrajaya/.test(name)) score -= 3;
      return { p, score };
    })
    .filter(Boolean) as Array<{ p: T; score: number }>;
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

/**
 * Prepend Airport → {booked hotel name} rows for selected hotels.
 * Uses the matching city Airport→Hotel rate product underneath; hides the replaced generic city-hotel row.
 * Prefer passing only the day hotel(s) so multi-city trips do not bind KL rates onto Langkawi days.
 */
export function bindAirportTransfersToSelectedHotels<T extends {
  id?: string;
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}>(
  products: T[],
  hotels: Array<Record<string, unknown>>,
): Array<T & { listKey?: string; boundHotelName?: string }> {
  const bound: Array<T & { listKey?: string; boundHotelName?: string }> = [];
  const replacedBaseIds = new Set<string>();

  for (const hotel of hotels) {
    const hotelName = String(hotel.hotelName || hotel.name || "").trim();
    if (!hotelName) continue;
    const hotelCity = String(hotel.tripCity || hotel.city || "").trim();
    if (!hotelCity) continue;
    const hub = resolveTransferHubCity(hotelCity);
    const base = findBaseAirportTransferForHotelCity(products, hotelCity)
      // Only fall back within the same airport hub — never price Langkawi with KLIA rates.
      || products.find((p) => {
        if (!isAirportToHotelTransfer(p)) return false;
        const hay = `${p.name || ""} ${p.pickupLocation || ""}`.toLowerCase();
        if (hub === "Langkawi") return /langkawi\s*airport/.test(hay);
        if (hub === "Penang") return /penang/.test(hay) && /airport/.test(hay);
        return /kuala lumpur airport|klia/.test(hay) && /kuala lumpur hotel/i.test(`${p.name || ""} ${p.dropLocation || ""}`);
      })
      || null;
    if (!base) continue;
    const baseId = String(base.id || "");
    if (baseId) replacedBaseIds.add(baseId);
    const airport = resolveAirportLabelForHotelCity(hotelCity);
    const lineId = String(hotel.lineId || hotel.productId || hotelName);
    bound.push({
      ...base,
      name: `One Way Transfer from ${airport} - ${hotelName}`,
      pickupLocation: airport,
      dropLocation: hotelName,
      listKey: `hotel-bound:${lineId}:${baseId}`,
      boundHotelName: hotelName,
    });
  }

  const rest = products.filter((p) => {
    const id = String(p.id || "");
    // Hide generic "Kuala Lumpur Hotel / Genting Hotel …" rows once a real hotel is bound.
    if (bound.length && isGenericCityHotelAirportTransfer(p)) return false;
    if (id && replacedBaseIds.has(id) && isGenericCityHotelAirportTransfer(p)) return false;
    return true;
  });

  // Bound hotel cards first so "Airport → your hotel" is obvious.
  return [...bound, ...rest.map((p) => ({ ...p, listKey: String(p.id || p.name || "") }))];
}

/** Catalogue DESTINATION title for list cards (full KTH name when available). */
export function formatTransferDestination(item: {
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}): string {
  const name = normalizeTransferDestinationName(String(item.name || ""));
  if (/^One Way Transfer from\s+/i.test(name)) return name;
  return formatTransferRoute(item);
}

/** Short route label for compact UI: "Airport → Kuala Lumpur Hotel". */
export function formatTransferRoute(item: {
  name?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
}): string {
  let pickup = String(item.pickupLocation || "").trim();
  let drop = String(item.dropLocation || "").trim();
  const name = String(item.name || "").trim();

  if ((!pickup || !drop) && name) {
    const m = name.match(/from\s+(.+?)\s+-\s+(.+)$/i);
    if (m) {
      pickup = pickup || m[1].trim();
      drop = drop || m[2].trim();
    }
  }

  const tidy = (s: string) =>
    s
      .replace(/^One Way Transfer from\s+/i, "")
      .replace(/Kuala Lumpur Airport/gi, "Airport")
      .replace(/Langkawi Airport/gi, "Airport")
      .replace(/Penang Airport/gi, "Airport")
      .replace(/\s+/g, " ")
      .trim();

  if (pickup && drop) return `${tidy(pickup)} → ${tidy(drop)}`;
  return tidy(name) || "Transfer";
}

/** Minutes after landing before pickup is allowed (exit immigration / baggage). */
export const AIRPORT_EXIT_BUFFER_MINUTES = 60;

/** Parse "10:30", "10:30 AM", "22:05" → minutes from midnight, or null. */
export function parseClockToMinutes(value: string): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const ap = ampm[3].toLowerCase();
    if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59) return null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23) return null;
    return h * 60 + m;
  }
  const hm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!hm) return null;
  const h = Number(hm[1]);
  const m = Number(hm[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function formatMinutesToClock(totalMinutes: number): string {
  const day = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(day / 60);
  const m = day % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Earliest allowed airport pickup = flight arrival + exit buffer.
 * Example: lands 10:30 → earliest 11:30 (60 min buffer).
 */
export function earliestAirportPickupTime(
  arrivalTime: string,
  bufferMinutes: number = AIRPORT_EXIT_BUFFER_MINUTES,
): string | null {
  const mins = parseClockToMinutes(arrivalTime);
  if (mins == null) return null;
  return formatMinutesToClock(mins + Math.max(0, bufferMinutes));
}

/** Find inbound flight arrival for the pickup day (uses arrTime / arrivalTime). */
export function resolveFlightArrivalForPickup(
  flights: Array<Record<string, unknown>>,
  serviceDate?: string,
): { arrTime: string; label: string; date: string } | null {
  const date = String(serviceDate || "").trim();
  const ranked = [...flights].map((f) => {
    const arrTime = String(f.arrTime || f.arrivalTime || "").trim();
    const flightDate = String(f.arrivalDate || f.date || "").trim();
    const airline = String(f.airline || f.airlineCode || "").trim();
    const number = String(f.flightNumber || "").trim();
    return {
      arrTime,
      date: flightDate,
      label: [airline, number].filter(Boolean).join(" ") || "Flight",
      score: (arrTime ? 2 : 0) + (date && flightDate === date ? 3 : 0),
    };
  }).filter((f) => f.arrTime);

  if (!ranked.length) return null;
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return { arrTime: best.arrTime, label: best.label, date: best.date };
}
