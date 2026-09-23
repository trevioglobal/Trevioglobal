export type FlightDetail = {
  airline?: string;
  flightNumber?: string;
  from?: string;
  to?: string;
  date?: string;
  time?: string;
  pnr?: string;
  selfBooked?: boolean;
};

export type HotelDetail = {
  name?: string;
  checkIn?: string;
  checkOut?: string;
  confirmationNo?: string;
  roomCategory?: string;
  mealPlan?: string;
  selfBooked?: boolean;
};

export type TravelDetails = {
  flights?: FlightDetail[];
  hotel?: HotelDetail;
};

function asStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function jsonArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

export function parseTravelDetails(raw: unknown): TravelDetails {
  if (!raw || typeof raw !== "object") return { flights: [], hotel: {} };
  const o = raw as Record<string, unknown>;
  return {
    flights: Array.isArray(o.flights) ? (o.flights as FlightDetail[]) : [],
    hotel: (o.hotel as HotelDetail) || {},
  };
}

/**
 * Completeness for Confirmed status.
 * Land-only / no Flight services → flight from/to/date not required.
 * Hotel name from travelDetails or any Hotel service title is enough.
 */
export function travelDetailsComplete(
  travelDetails: unknown,
  services: { serviceType: string; status: string; title?: string; confirmationNo?: string | null }[],
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const td = parseTravelDetails(travelDetails);
  const flights = td.flights || [];
  const hasFlightServices = services.some((s) => /flight/i.test(s.serviceType));

  if (hasFlightServices) {
    const flightOk = flights.some(
      (f) => Boolean(asStr(f.from) && asStr(f.to) && asStr(f.date)),
    );
    if (!flightOk) missing.push("flight details (from, to, date)");
  }

  const confirmedHotel = services.find((s) => s.serviceType === "Hotel" && s.status === "Confirmed");
  const anyHotel = services.find((s) => /hotel/i.test(s.serviceType));
  const hotel = td.hotel || {};
  const hotelName = asStr(hotel.name || confirmedHotel?.title || anyHotel?.title);
  if (anyHotel || confirmedHotel) {
    if (!hotelName) missing.push("hotel name");
  } else if (!hotelName && services.some((s) => /hotel|holiday|package/i.test(s.serviceType))) {
    missing.push("hotel name");
  }

  return { ok: missing.length === 0, missing };
}

/** Parse route / dates that were packed into BookingService.notes during conversion. */
function parseFlightNotes(notes: string | null | undefined): Partial<FlightDetail> {
  const n = String(notes || "");
  const route = n.match(/([A-Za-z]{3})\s*→\s*([A-Za-z]{3})/);
  const dep = n.match(/Dep\s+(\d{4}-\d{2}-\d{2})/i);
  const time = n.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  const pnr = n.match(/PNR:\s*([A-Z0-9]+)/i);
  return {
    from: route?.[1],
    to: route?.[2],
    date: dep?.[1],
    time: time?.[1],
    pnr: pnr?.[1],
  };
}

function parseHotelNotes(notes: string | null | undefined): Partial<HotelDetail> {
  const n = String(notes || "");
  const dates = n.match(/(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})/);
  return {
    checkIn: dates?.[1],
    checkOut: dates?.[2],
    selfBooked: /self-booked/i.test(n),
  };
}

export function seedTravelDetailsFromServices(
  services: {
    serviceType: string;
    title: string;
    confirmationNo?: string | null;
    notes?: string | null;
  }[],
): TravelDetails {
  const flights: FlightDetail[] = [];
  let hotel: HotelDetail = {};

  for (const s of services) {
    if (s.serviceType === "Flight") {
      const fromNotes = parseFlightNotes(s.notes);
      flights.push({
        airline: s.title.split(" ")[0],
        flightNumber: s.title.split(" ").slice(1).join(" ") || undefined,
        from: fromNotes.from,
        to: fromNotes.to,
        date: fromNotes.date,
        time: fromNotes.time,
        pnr: s.confirmationNo || fromNotes.pnr || undefined,
        selfBooked: false,
      });
    }
    if (s.serviceType === "Hotel" && !hotel.name) {
      const fromNotes = parseHotelNotes(s.notes);
      hotel = {
        name: s.title,
        confirmationNo: s.confirmationNo || undefined,
        checkIn: fromNotes.checkIn,
        checkOut: fromNotes.checkOut,
        selfBooked: fromNotes.selfBooked || false,
      };
    }
  }

  return { flights, hotel };
}

/**
 * Preferred: seed Travel tab directly from quotation package lines
 * (same data ops will confirm — no re-entry of hotel/flight after accept).
 */
export function seedTravelDetailsFromPackage(selected: {
  hotels?: unknown;
  flights?: unknown;
}): TravelDetails {
  const flights: FlightDetail[] = jsonArr(selected.flights).map((f) => ({
    airline: asStr(f.airline) || undefined,
    flightNumber: asStr(f.flightNumber || f.flightNo) || undefined,
    from: asStr(f.from) || undefined,
    to: asStr(f.to) || undefined,
    date: asStr(f.date || f.departureDate) || undefined,
    time: asStr(f.depTime || f.time) || undefined,
    pnr: asStr(f.pnr || f.confirmationNumber) || undefined,
    selfBooked: f.selfBooked === true || String(f.source || "") === "MANUAL",
  }));

  const hotels = jsonArr(selected.hotels);
  const h = hotels[0];
  const hotel: HotelDetail = h
    ? {
        name: asStr(h.hotelName || h.name) || undefined,
        checkIn: asStr(h.checkIn) || undefined,
        checkOut: asStr(h.checkOut) || undefined,
        confirmationNo: asStr(h.confirmationNo || h.confirmationNumber) || undefined,
        roomCategory: asStr(h.roomType || h.roomCategory) || undefined,
        mealPlan: asStr(h.mealPlan) || undefined,
        selfBooked: h.selfBooked === true || String(h.source || "") === "MANUAL",
      }
    : {};

  return { flights, hotel };
}
