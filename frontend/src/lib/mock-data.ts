// Travel Partner Pro — Rich Mock Data

import type {
  Agency, Branch, Flight, Hotel, HolidayPackage, Customer, Lead,
  Booking, Payment, WalletTransaction, Employee, Task, Quotation, Notification, User,
} from "@/types";

export const ROLE_USERS: Record<string, User> = {
  super_admin: {
    id: "u-sa-1", name: "Rajesh Mehta", email: "superadmin@travelpartner.pro",
    phone: "+91 98100 00001", role: "super_admin", designation: "Platform Owner",
  },
  agency_admin: {
    id: "u-aa-1", name: "Priya Sharma", email: "admin@wanderlusttravels.in",
    phone: "+91 98200 12345", role: "agency_admin", agencyId: "ag-1",
    designation: "Agency Owner",
  },
  branch_manager: {
    id: "u-bm-1", name: "Arjun Nair", email: "manager.mumbai@wanderlusttravels.in",
    phone: "+91 98300 22222", role: "branch_manager", agencyId: "ag-1", branchId: "br-1",
    designation: "Mumbai Branch Manager",
  },
  employee: {
    id: "u-em-1", name: "Sneha Reddy", email: "sneha@wanderlusttravels.in",
    phone: "+91 98400 33333", role: "employee", agencyId: "ag-1", branchId: "br-1",
    designation: "Senior Travel Consultant",
  },
  accountant: {
    id: "u-ac-1", name: "Vikram Iyer", email: "accounts@wanderlusttravels.in",
    phone: "+91 98500 44444", role: "accountant", agencyId: "ag-1",
    designation: "Finance Manager",
  },
  sales_executive: {
    id: "u-se-1", name: "Ananya Kapoor", email: "sales@wanderlusttravels.in",
    phone: "+91 98600 55555", role: "sales_executive", agencyId: "ag-1", branchId: "br-1",
    designation: "Sales Executive",
  },
  product_executive: {
    id: "u-pe-1", name: "Rohan Desai", email: "products@wanderlusttravels.in",
    phone: "+91 98700 66666", role: "product_executive", agencyId: "ag-1",
    designation: "Product Executive",
  },
  operations: {
    id: "u-op-1", name: "Meera Joshi", email: "ops@wanderlusttravels.in",
    phone: "+91 98800 77777", role: "operations", agencyId: "ag-1", branchId: "br-1",
    designation: "Operations Executive",
  },
  travel_agent: {
    id: "u-ta-1", name: "Kabir Khan", email: "agent@wanderlusttravels.in",
    phone: "+91 98900 88888", role: "travel_agent", agencyId: "ag-1", branchId: "br-1",
    designation: "Travel Agent",
  },
  management: {
    id: "u-mg-1", name: "Nisha Patel", email: "management@wanderlusttravels.in",
    phone: "+91 99000 99999", role: "management", agencyId: "ag-1",
    designation: "General Manager",
  },
};

/** Shared demo password for all ROLE_USERS accounts after seed. */
export const DEMO_LOGIN_PASSWORD = "Passw0rd@123";

export const DEMO_LOGIN_ROWS: Array<{ role: string; email: string; password: string; note?: string }> = [
  { role: "Developer (full platform)", email: "dev@trevioglobal.com", password: "Dev@Trevio2026!", note: "Your developer Super Admin — agencies, analytics, monitoring UI, marketing/coupons shells" },
  { role: "Super Admin", email: "superadmin@travelpartner.pro", password: DEMO_LOGIN_PASSWORD },
  { role: "Agency Admin", email: "admin@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Branch Manager", email: "manager.mumbai@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Employee / Agent", email: "sneha@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Accountant", email: "accounts@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Sales Executive", email: "sales@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Product Executive", email: "products@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Operations", email: "ops@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Travel Agent", email: "agent@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Management", email: "management@wanderlusttravels.in", password: DEMO_LOGIN_PASSWORD },
  { role: "Platform Super Admin (alt)", email: "admin@travelpartner.pro", password: "TravioAdmin@2024!", note: "Created separately by seed" },
];

export const AGENCIES: Agency[] = [
  { id: "ag-1", name: "Wanderlust Travels", owner: "Priya Sharma", email: "admin@wanderlusttravels.in", phone: "+91 98200 12345", plan: "Enterprise", status: "Active", walletBalance: 845000, commissionEarned: 1240000, totalBookings: 3420, monthlyRevenue: 2850000, apiAllocation: { flights: 50000, hotels: 30000 }, createdAt: "2023-02-14", branches: 4, employees: 38 },
  { id: "ag-2", name: "Sky High Holidays", owner: "Mohit Agarwal", email: "ops@skyhighholidays.com", phone: "+91 98111 23456", plan: "Growth", status: "Active", walletBalance: 312000, commissionEarned: 560000, totalBookings: 1890, monthlyRevenue: 1450000, apiAllocation: { flights: 20000, hotels: 15000 }, createdAt: "2023-06-20", branches: 2, employees: 18 },
  { id: "ag-3", name: "Royal Routes Tourism", owner: "Fatima Sheikh", email: "info@royalroutes.in", phone: "+91 98222 34567", plan: "Enterprise", status: "Active", walletBalance: 1250000, commissionEarned: 2100000, totalBookings: 5100, monthlyRevenue: 4200000, apiAllocation: { flights: 80000, hotels: 50000 }, createdAt: "2022-11-03", branches: 7, employees: 64 },
  { id: "ag-4", name: "Voyage Vista", owner: "Anil Kapoor", email: "hello@voyagevista.co", phone: "+91 98333 45678", plan: "Starter", status: "Trial", walletBalance: 45000, commissionEarned: 78000, totalBookings: 320, monthlyRevenue: 240000, apiAllocation: { flights: 5000, hotels: 3000 }, createdAt: "2024-09-12", branches: 1, employees: 6 },
  { id: "ag-5", name: "Global Gateway Tours", owner: "Sunita Menon", email: "contact@globalgateway.in", phone: "+91 98444 56789", plan: "Growth", status: "Active", walletBalance: 498000, commissionEarned: 890000, totalBookings: 2400, monthlyRevenue: 1980000, apiAllocation: { flights: 25000, hotels: 18000 }, createdAt: "2023-04-08", branches: 3, employees: 24 },
  { id: "ag-6", name: "Horizon Holidays", owner: "Deepak Joshi", email: "team@horizonholidays.in", phone: "+91 98555 67890", plan: "Enterprise", status: "Suspended", walletBalance: -12000, commissionEarned: 450000, totalBookings: 980, monthlyRevenue: 720000, apiAllocation: { flights: 10000, hotels: 8000 }, createdAt: "2023-08-25", branches: 2, employees: 12 },
];

export const BRANCHES: Branch[] = [
  { id: "br-1", agencyId: "ag-1", name: "Mumbai - Andheri", manager: "Arjun Nair", city: "Mumbai", employees: 12, revenue: 980000 },
  { id: "br-2", agencyId: "ag-1", name: "Delhi - Connaught Place", manager: "Rahul Khanna", city: "New Delhi", employees: 14, revenue: 1120000 },
  { id: "br-3", agencyId: "ag-1", name: "Bangalore - Indiranagar", manager: "Deepa Rao", city: "Bangalore", employees: 8, revenue: 540000 },
  { id: "br-4", agencyId: "ag-1", name: "Chennai - T. Nagar", manager: "Suresh Babu", city: "Chennai", employees: 4, revenue: 210000 },
];

const AIRLINES = [
  { name: "IndiGo", code: "6E", aircraft: "Airbus A320neo", rating: 4.2 },
  { name: "Air India", code: "AI", aircraft: "Boeing 787 Dreamliner", rating: 4.0 },
  { name: "Vistara", code: "UK", aircraft: "Airbus A321neo", rating: 4.5 },
  { name: "SpiceJet", code: "SG", aircraft: "Boeing 737 MAX", rating: 3.8 },
  { name: "Akasa Air", code: "QP", aircraft: "Boeing 737 MAX 8", rating: 4.1 },
  { name: "Air India Express", code: "IX", aircraft: "Boeing 737-800", rating: 3.9 },
  { name: "Emirates", code: "EK", aircraft: "Airbus A380", rating: 4.7 },
  { name: "Singapore Airlines", code: "SQ", aircraft: "Airbus A350", rating: 4.8 },
  { name: "Qatar Airways", code: "QR", aircraft: "Boeing 777-300ER", rating: 4.6 },
  { name: "AirAsia", code: "AK", aircraft: "Airbus A320", rating: 3.9 },
  { name: "Malaysia Airlines", code: "MH", aircraft: "Boeing 737 MAX 8", rating: 4.3 },
  { name: "Thai Airways", code: "TG", aircraft: "Boeing 777-300ER", rating: 4.3 },
  { name: "Thai AirAsia", code: "FD", aircraft: "Airbus A320", rating: 3.9 },
  { name: "VietJet Air", code: "VJ", aircraft: "Airbus A321", rating: 3.8 },
  { name: "Vietnam Airlines", code: "VN", aircraft: "Airbus A350", rating: 4.4 },
  { name: "Garuda Indonesia", code: "GA", aircraft: "Boeing 737-800", rating: 4.3 },
  { name: "Scoot", code: "TR", aircraft: "Boeing 787", rating: 4.0 },
];

function airline(code: string) {
  return AIRLINES.find((a) => a.code === code)!;
}

// code -> { city, country } for every airport this app searches
const AIRPORT_INDEX: Record<string, { city: string; country: string }> = {
  BOM: { city: "Mumbai", country: "India" }, DEL: { city: "New Delhi", country: "India" },
  BLR: { city: "Bangalore", country: "India" }, MAA: { city: "Chennai", country: "India" },
  HYD: { city: "Hyderabad", country: "India" }, CCU: { city: "Kolkata", country: "India" },
  GOI: { city: "Goa", country: "India" }, GOX: { city: "Goa", country: "India" },
  COK: { city: "Kochi", country: "India" }, PNQ: { city: "Pune", country: "India" },
  AMD: { city: "Ahmedabad", country: "India" }, JAI: { city: "Jaipur", country: "India" },
  LKO: { city: "Lucknow", country: "India" }, IXC: { city: "Chandigarh", country: "India" },
  GAU: { city: "Guwahati", country: "India" }, PAT: { city: "Patna", country: "India" },
  BBI: { city: "Bhubaneswar", country: "India" }, IXZ: { city: "Port Blair", country: "India" },
  SXR: { city: "Srinagar", country: "India" }, IXB: { city: "Bagdogra", country: "India" },
  TRV: { city: "Thiruvananthapuram", country: "India" }, IXM: { city: "Madurai", country: "India" },
  VNS: { city: "Varanasi", country: "India" }, NAG: { city: "Nagpur", country: "India" },
  IDR: { city: "Indore", country: "India" }, RPR: { city: "Raipur", country: "India" },
  UDR: { city: "Udaipur", country: "India" }, ATQ: { city: "Amritsar", country: "India" },
  DXB: { city: "Dubai", country: "UAE" }, AUH: { city: "Abu Dhabi", country: "UAE" },
  SHJ: { city: "Sharjah", country: "UAE" },
  SIN: { city: "Singapore", country: "Singapore" },
  BKK: { city: "Bangkok", country: "Thailand" }, DMK: { city: "Bangkok", country: "Thailand" },
  HKT: { city: "Phuket", country: "Thailand" },
  KUL: { city: "Kuala Lumpur", country: "Malaysia" },
  LON: { city: "London", country: "United Kingdom" }, LGW: { city: "London", country: "United Kingdom" },
  LTN: { city: "London", country: "United Kingdom" }, MAN: { city: "Manchester", country: "United Kingdom" },
  EDI: { city: "Edinburgh", country: "United Kingdom" }, DUB: { city: "Dublin", country: "Ireland" },
  JFK: { city: "New York", country: "USA" }, EWR: { city: "New York", country: "USA" },
  LGA: { city: "New York", country: "USA" }, SFO: { city: "San Francisco", country: "USA" },
  LAX: { city: "Los Angeles", country: "USA" }, ORD: { city: "Chicago", country: "USA" },
  SEA: { city: "Seattle", country: "USA" }, IAD: { city: "Washington D.C.", country: "USA" },
  ATL: { city: "Atlanta", country: "USA" }, MIA: { city: "Miami", country: "USA" },
  BOS: { city: "Boston", country: "USA" }, IAH: { city: "Houston", country: "USA" },
  DFW: { city: "Dallas", country: "USA" },
  YYZ: { city: "Toronto", country: "Canada" }, YVR: { city: "Vancouver", country: "Canada" },
  YUL: { city: "Montreal", country: "Canada" }, MEX: { city: "Mexico City", country: "Mexico" },
  GRU: { city: "São Paulo", country: "Brazil" }, GIG: { city: "Rio de Janeiro", country: "Brazil" },
  EZE: { city: "Buenos Aires", country: "Argentina" }, SCL: { city: "Santiago", country: "Chile" },
  BOG: { city: "Bogotá", country: "Colombia" },
  SYD: { city: "Sydney", country: "Australia" }, MEL: { city: "Melbourne", country: "Australia" },
  BNE: { city: "Brisbane", country: "Australia" }, PER: { city: "Perth", country: "Australia" },
  AKL: { city: "Auckland", country: "New Zealand" },
  DOH: { city: "Doha", country: "Qatar" }, KWI: { city: "Kuwait City", country: "Kuwait" },
  BAH: { city: "Manama", country: "Bahrain" }, MCT: { city: "Muscat", country: "Oman" },
  RUH: { city: "Riyadh", country: "Saudi Arabia" }, JED: { city: "Jeddah", country: "Saudi Arabia" },
  IST: { city: "Istanbul", country: "Turkey" }, TLV: { city: "Tel Aviv", country: "Israel" },
  CAI: { city: "Cairo", country: "Egypt" }, JNB: { city: "Johannesburg", country: "South Africa" },
  CPT: { city: "Cape Town", country: "South Africa" }, NBO: { city: "Nairobi", country: "Kenya" },
  ADD: { city: "Addis Ababa", country: "Ethiopia" }, LOS: { city: "Lagos", country: "Nigeria" },
  CDG: { city: "Paris", country: "France" }, ORY: { city: "Paris", country: "France" },
  NCE: { city: "Nice", country: "France" }, FRA: { city: "Frankfurt", country: "Germany" },
  MUC: { city: "Munich", country: "Germany" }, BER: { city: "Berlin", country: "Germany" },
  AMS: { city: "Amsterdam", country: "Netherlands" }, MAD: { city: "Madrid", country: "Spain" },
  BCN: { city: "Barcelona", country: "Spain" }, FCO: { city: "Rome", country: "Italy" },
  MXP: { city: "Milan", country: "Italy" }, ZRH: { city: "Zurich", country: "Switzerland" },
  VIE: { city: "Vienna", country: "Austria" }, BRU: { city: "Brussels", country: "Belgium" },
  CPH: { city: "Copenhagen", country: "Denmark" }, OSL: { city: "Oslo", country: "Norway" },
  ARN: { city: "Stockholm", country: "Sweden" }, HEL: { city: "Helsinki", country: "Finland" },
  LIS: { city: "Lisbon", country: "Portugal" }, ATH: { city: "Athens", country: "Greece" },
  WAW: { city: "Warsaw", country: "Poland" }, PRG: { city: "Prague", country: "Czech Republic" },
  SVO: { city: "Moscow", country: "Russia" },
  HKG: { city: "Hong Kong", country: "Hong Kong" },
  NRT: { city: "Tokyo", country: "Japan" }, HND: { city: "Tokyo", country: "Japan" },
  KIX: { city: "Osaka", country: "Japan" }, ICN: { city: "Seoul", country: "South Korea" },
  PEK: { city: "Beijing", country: "China" }, PVG: { city: "Shanghai", country: "China" },
  CAN: { city: "Guangzhou", country: "China" }, TPE: { city: "Taipei", country: "Taiwan" },
  MNL: { city: "Manila", country: "Philippines" }, CGK: { city: "Jakarta", country: "Indonesia" },
  DPS: { city: "Bali", country: "Indonesia" },
  SGN: { city: "Ho Chi Minh City", country: "Vietnam" }, HAN: { city: "Hanoi", country: "Vietnam" },
  RGN: { city: "Yangon", country: "Myanmar" }, DAC: { city: "Dhaka", country: "Bangladesh" },
  KTM: { city: "Kathmandu", country: "Nepal" }, CMB: { city: "Colombo", country: "Sri Lanka" },
  MLE: { city: "Malé", country: "Maldives" }, ISB: { city: "Islamabad", country: "Pakistan" },
  KHI: { city: "Karachi", country: "Pakistan" },
};

const INDIA_CODES = new Set(Object.keys(AIRPORT_INDEX).filter((c) => AIRPORT_INDEX[c].country === "India"));
const NEAR_ASIA_CODES = new Set(["SIN", "BKK", "DMK", "HKT", "KUL", "DPS", "CGK", "SGN", "HAN", "RGN", "DAC", "KTM", "CMB", "MLE", "ISB", "KHI", "HKG", "TPE", "MNL"]);
const MIDEAST_CODES = new Set(["DXB", "AUH", "SHJ", "DOH", "KWI", "BAH", "MCT", "RUH", "JED", "IST", "TLV"]);

// Which operators plausibly fly a given destination, keyed by airport code
const ROUTE_AIRLINES: Record<string, string[]> = {
  SIN: ["SQ", "TR", "6E", "AI"],
  KUL: ["MH", "AK", "6E", "IX"],
  BKK: ["TG", "FD", "6E", "IX", "UK"], DMK: ["TG", "FD", "6E", "IX", "UK"], HKT: ["TG", "FD", "6E"],
  DPS: ["GA", "AK", "SQ", "6E"], CGK: ["GA", "AK", "6E"],
  SGN: ["VN", "VJ", "6E", "IX"], HAN: ["VN", "VJ", "6E", "IX"],
};

function airlinesForRoute(destination: string): string[] {
  if (ROUTE_AIRLINES[destination]) return ROUTE_AIRLINES[destination];
  if (MIDEAST_CODES.has(destination)) return ["EK", "QR", "AI", "6E", "IX"];
  if (NEAR_ASIA_CODES.has(destination)) return ["AI", "IX", "6E", "UK"];
  if (!INDIA_CODES.has(destination)) return ["EK", "QR", "SQ", "AI", "UK"]; // long-haul via hub carriers
  return ["6E", "AI", "UK", "SG", "QP", "IX"]; // domestic
}

function routeTier(origin: string, destination: string): "domestic" | "near" | "mideast" | "far" {
  if (INDIA_CODES.has(origin) && INDIA_CODES.has(destination)) return "domestic";
  const other = INDIA_CODES.has(origin) ? destination : origin;
  if (MIDEAST_CODES.has(other)) return "mideast";
  if (NEAR_ASIA_CODES.has(other)) return "near";
  return "far";
}

const TIER_CONFIG = {
  domestic: { base: 4200, step: 1800, stopFee: 1200, durMin: 2, durSpread: 3.5 },
  near: { base: 11500, step: 3200, stopFee: 2500, durMin: 4, durSpread: 5 },
  mideast: { base: 14500, step: 3800, stopFee: 3000, durMin: 3, durSpread: 4.5 },
  far: { base: 30000, step: 6500, stopFee: 5000, durMin: 7, durSpread: 9 },
} as const;

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

export function generateFlights(origin: string, destination: string, count = 8): Flight[] {
  const flights: Flight[] = [];
  const depHours = ["06:00", "07:30", "09:15", "11:00", "13:45", "16:20", "18:30", "20:10", "22:05"];
  const tier = routeTier(origin, destination);
  const cfg = TIER_CONFIG[tier];
  const pool = airlinesForRoute(destination).map(airline).filter(Boolean);
  const originCity = AIRPORT_INDEX[origin]?.city || origin;
  const destinationCity = AIRPORT_INDEX[destination]?.city || destination;

  for (let i = 0; i < count; i++) {
    const al = pick(pool.length ? pool : AIRLINES, i);
    const dep = pick(depHours, i);
    const dur = cfg.durMin + (i % 4) * (cfg.durSpread / 4) + (i % 2) * 0.5;
    const arrH = (parseInt(dep.slice(0, 2)) + Math.floor(dur)) % 24;
    const arrM = (parseInt(dep.slice(3, 5)) + Math.round((dur % 1) * 60)) % 60;
    const stops = i % 5 === 0 ? 1 : 0;
    flights.push({
      id: `fl-${i + 1}`, airline: al.name, airlineCode: al.code,
      flightNumber: `${al.code}${100 + i * 37}`,
      origin, originCity,
      destination, destinationCity,
      departTime: dep,
      arriveTime: `${String(arrH).padStart(2, "0")}:${String(arrM).padStart(2, "0")}`,
      duration: `${Math.floor(dur)}h ${Math.round((dur % 1) * 60)}m`,
      stops,
      price: cfg.base + (i % 4) * cfg.step + (stops ? cfg.stopFee : 0),
      currency: "INR",
      cabin: i % 6 === 0 ? "Business" : "Economy",
      seatsLeft: 4 + (i % 12),
      refundable: i % 3 !== 0,
      aircraft: al.aircraft,
      rating: al.rating,
    });
  }
  return flights.sort((a, b) => a.price - b.price);
}

export const POPULAR_FLIGHTS = generateFlights("BOM", "DEL", 8);

const HOTEL_NAMES = [
  "The Taj Palace", "The Oberoi", "Trident", "ITC Maratha", "The Leela Palace",
  "Hyatt Regency", "Marriott Executive", "Taj Lands End", "Novotel", "Four Seasons",
  "Shangri-La", "JW Marriott", "Grand Hyatt", "Radisson Blu", "Hilton Garden Inn",
];
const AREAS = ["Andheri East", "Bandra West", "Colaba", "Juhu Beach", "Powai", "Worli", "Lower Parel", "Nariman Point"];
const AMENITIES_POOL = ["Free WiFi", "Swimming Pool", "Spa", "Gym", "Restaurant", "Bar", "Airport Shuttle", "Business Center", "Valet Parking", "Concierge", "Kids Club", "Beach Access"];

export function generateHotels(city: string, count = 8): Hotel[] {
  const hotels: Hotel[] = [];
  for (let i = 0; i < count; i++) {
    const name = pick(HOTEL_NAMES, i);
    const star = 3 + (i % 3);
    const price = 3200 + (i % 5) * 1500 + star * 800;
    const amenities = AMENITIES_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 6 + (i % 4));
    hotels.push({
      id: `ht-${i + 1}`, name: `${name} ${city}`, city, area: pick(AREAS, i),
      starRating: star, rating: 3.8 + (i % 10) / 10, reviews: 120 + (i * 37) % 900,
      pricePerNight: price, currency: "INR", originalPrice: price + 1200,
      amenities,
      images: [],
      distanceFromCenter: 1 + (i * 0.7) % 8,
      latitude: 19.0 + (i * 0.03) % 0.3, longitude: 72.8 + (i * 0.04) % 0.4,
      rooms: [
        { id: `r-${i}-1`, name: "Deluxe Room", description: "King size bed, city view, 280 sq.ft", price, maxGuests: 2, beds: "1 King Bed", includesBreakfast: true, freeCancellation: true, refundable: true, roomsLeft: 4 + (i % 5) },
        { id: `r-${i}-2`, name: "Premium Suite", description: "Separate living area, 450 sq.ft", price: price + 2500, maxGuests: 3, beds: "1 King + Sofa", includesBreakfast: true, freeCancellation: true, refundable: true, roomsLeft: 2 + (i % 3) },
        { id: `r-${i}-3`, name: "Executive Club", description: "Lounge access, 350 sq.ft", price: price + 1500, maxGuests: 2, beds: "1 King Bed", includesBreakfast: true, freeCancellation: false, refundable: false, roomsLeft: 1 + (i % 4) },
      ],
    });
  }
  return hotels.sort((a, b) => b.rating - a.rating);
}

export const POPULAR_HOTELS = generateHotels("Mumbai", 8);



export const HOLIDAY_PACKAGES: HolidayPackage[] = [
  { id: "pk-1", title: "Bali Bliss - 6N/7D", destination: "Bali", country: "Indonesia", type: "Honeymoon", duration: "6 Nights 7 Days", nights: 6, days: 7, price: 49999, originalPrice: 65000, rating: 4.7, reviews: 234, image: "", highlights: ["Private Pool Villa", "Sunset Dinner Cruise", "Uluwatu Temple Tour", "Kintamani Volcano"], inclusions: ["Return Flights", "6N Villa Stay", "Daily Breakfast", "All Transfers", "Tour Passes"], isInternational: true },
  { id: "pk-2", title: "Kashmir Paradise - 5N/6D", destination: "Srinagar", country: "India", type: "Family", duration: "5 Nights 6 Days", nights: 5, days: 6, price: 28999, originalPrice: 38000, rating: 4.6, reviews: 412, image: "", highlights: ["Shikara Ride in Dal Lake", "Gulmarg Gondola", "Pahalgam Valley", "Mughal Gardens"], inclusions: ["5N Houseboat + Hotel", "Daily Breakfast & Dinner", "All Sightseeing", "Private Cab"], isInternational: false },
  { id: "pk-3", title: "Dubai Deluxe - 4N/5D", destination: "Dubai", country: "UAE", type: "Family", duration: "4 Nights 5 Days", nights: 4, days: 5, price: 54999, originalPrice: 72000, rating: 4.5, reviews: 567, image: "", highlights: ["Burj Khalifa Access", "Desert Safari with BBQ", "Dhow Cruise Dinner", "Dubai Mall Tour"], inclusions: ["Return Flights", "4N 4★ Hotel", "Daily Breakfast", "Visa", "All Transfers", "6 Tours"], isInternational: true },
  { id: "pk-4", title: "Andaman Islands - 5N/6D", destination: "Port Blair", country: "India", type: "Honeymoon", duration: "5 Nights 6 Days", nights: 5, days: 6, price: 39999, originalPrice: 52000, rating: 4.8, reviews: 189, image: "", highlights: ["Scuba Diving", "Havelock Beach", "Cellular Jail", "Sea Walking"], inclusions: ["Return Flights", "5N Beach Resort", "Daily Breakfast & Dinner", "All Ferries", "Water Sports"], isInternational: false },
  { id: "pk-5", title: "Europe Explorer - 11N/12D", destination: "Paris, Rome, Switzerland", country: "Multi", type: "Group", duration: "11 Nights 12 Days", nights: 11, days: 12, price: 199999, originalPrice: 245000, rating: 4.7, reviews: 98, image: "", highlights: ["Eiffel Tower", "Vatican City", "Swiss Alps", "Amsterdam Canals", "Rhine Falls"], inclusions: ["Return Flights", "Schengen Visa", "11N 4★ Hotels", "Daily Breakfast & 6 Dinners", "Euro Rail", "All Transfers"], isInternational: true },
  { id: "pk-6", title: "Goa Beach Party - 3N/4D", destination: "Goa", country: "India", type: "Group", duration: "3 Nights 4 Days", nights: 3, days: 4, price: 14999, originalPrice: 22000, rating: 4.3, reviews: 723, image: "", highlights: ["Baga Beach", "Cruise Party", "Dudhsagar Falls", "Casino Night"], inclusions: ["3N Beach Resort", "Daily Breakfast", "Airport Transfer", "North Goa Tour"], isInternational: false },
];

export const CUSTOMERS: Customer[] = [
  { id: "cu-1", name: "Karthik Venkat", email: "karthik.v@gmail.com", phone: "+91 99600 55555", type: "Individual", totalBookings: 24, totalSpent: 485000, loyaltyPoints: 4850, tier: "Platinum", passportNo: "P8394721", visaStatus: "Valid", lastBooking: "2025-01-12", city: "Chennai", createdAt: "2023-03-15" },
  { id: "cu-2", name: "Rohit Gupta", email: "rohit.gupta@gmail.com", phone: "+91 98765 43210", type: "Corporate", totalBookings: 56, totalSpent: 1240000, loyaltyPoints: 12400, tier: "Platinum", passportNo: "T5629104", visaStatus: "Valid", lastBooking: "2025-01-18", city: "Gurgaon", createdAt: "2022-08-22" },
  { id: "cu-3", name: "Anjali Desai", email: "anjali.desai@yahoo.com", phone: "+91 90090 88776", type: "Individual", totalBookings: 8, totalSpent: 96000, loyaltyPoints: 960, tier: "Silver", passportNo: "R2289104", visaStatus: "None", lastBooking: "2024-12-28", city: "Pune", createdAt: "2024-01-10" },
  { id: "cu-4", name: "Imran Khan", email: "imran.khan@gmail.com", phone: "+91 91234 56780", type: "Individual", totalBookings: 15, totalSpent: 234000, loyaltyPoints: 2340, tier: "Gold", passportNo: "K9910234", visaStatus: "Expired", lastBooking: "2025-01-05", city: "Hyderabad", createdAt: "2023-07-19" },
  { id: "cu-5", name: "Meera Iyer", email: "meera.iyer@gmail.com", phone: "+91 90011 22334", type: "Individual", totalBookings: 3, totalSpent: 38000, loyaltyPoints: 380, tier: "Silver", visaStatus: "None", lastBooking: "2024-11-15", city: "Bangalore", createdAt: "2024-06-03" },
  { id: "cu-6", name: "TechCorp India Pvt Ltd", email: "travel@techcorp.in", phone: "+91 80123 45678", type: "Corporate", totalBookings: 142, totalSpent: 3850000, loyaltyPoints: 38500, tier: "Platinum", lastBooking: "2025-01-19", city: "Bangalore", createdAt: "2021-04-12" },
  { id: "cu-7", name: "Suresh Pillai", email: "suresh.pillai@gmail.com", phone: "+91 94455 66778", type: "Individual", totalBookings: 19, totalSpent: 312000, loyaltyPoints: 3120, tier: "Gold", passportNo: "L7720394", visaStatus: "Valid", lastBooking: "2025-01-16", city: "Kochi", createdAt: "2023-02-08" },
  { id: "cu-8", name: "Nisha Agarwal", email: "nisha.ag@gmail.com", phone: "+91 93322 11009", type: "Individual", totalBookings: 11, totalSpent: 178000, loyaltyPoints: 1780, tier: "Gold", passportNo: "A1120394", visaStatus: "Valid", lastBooking: "2024-12-30", city: "Kolkata", createdAt: "2023-10-25" },
];

export const LEADS: Lead[] = [
  { id: "ld-1", customerName: "Vivek Sharma", email: "vivek.s@gmail.com", phone: "+91 98111 11111", source: "Website", service: "Holiday", value: 185000, stage: "New", assignedTo: "Sneha Reddy", expectedClose: "2025-02-05", createdAt: "2025-01-19", notes: "Looking for Bali honeymoon package, 6 nights, flexible dates" },
  { id: "ld-2", customerName: "Pooja Mehta", email: "pooja.m@gmail.com", phone: "+91 98222 22222", source: "WhatsApp", service: "Flight", value: 45000, stage: "Qualified", assignedTo: "Sneha Reddy", expectedClose: "2025-01-28", createdAt: "2025-01-17", notes: "Mumbai-Dubai return for family of 4, March travel" },
  { id: "ld-3", customerName: "Amit Patel", email: "amit.patel@gmail.com", phone: "+91 98333 33333", source: "Google Ads", service: "Holiday", value: 220000, stage: "Follow-up", assignedTo: "Rahul Khanna", expectedClose: "2025-02-10", createdAt: "2025-01-14", notes: "Europe tour interest, 2 couples, May 2025" },
  { id: "ld-4", customerName: "Kavya Reddy", email: "kavya.r@gmail.com", phone: "+91 98444 44444", source: "Instagram", service: "Hotel", value: 38000, stage: "Quotation Sent", assignedTo: "Sneha Reddy", expectedClose: "2025-01-25", createdAt: "2025-01-12", notes: "Goa luxury resort, 3 nights, anniversary" },
  { id: "ld-5", customerName: "Sanjay Kumar", email: "sanjay.k@gmail.com", phone: "+91 98555 55555", source: "Referral", service: "Flight", value: 72000, stage: "Negotiation", assignedTo: "Deepa Rao", expectedClose: "2025-01-24", createdAt: "2025-01-10", notes: "Group booking 6 pax, Delhi-Singapore, asking for discount" },
  { id: "ld-7", customerName: "Manoj Joshi", email: "manoj.j@gmail.com", phone: "+91 98777 77777", source: "Facebook", service: "Holiday", value: 95000, stage: "New", assignedTo: "Rahul Khanna", expectedClose: "2025-02-15", createdAt: "2025-01-18", notes: "Andaman family package query" },
  { id: "ld-9", customerName: "Harish Reddy", email: "harish.r@gmail.com", phone: "+91 98999 99999", source: "Website", service: "Flight", value: 28000, stage: "Lost", assignedTo: "Sneha Reddy", expectedClose: "2025-01-12", createdAt: "2025-01-04", notes: "Booked directly with airline, price sensitive" },
];

export const BOOKINGS: Booking[] = [
  { id: "bk-1", bookingRef: "BK-8841", customerName: "Karthik Venkat", service: "Flight", route: "MUM → DEL → MUM", travelDate: "2025-02-14", amount: 28400, commission: 1420, status: "Confirmed", paymentStatus: "Paid", paymentMethod: "Razorpay", agent: "Sneha Reddy", agency: "Wanderlust Travels", createdAt: "2025-01-12" },
  { id: "bk-2", bookingRef: "BK-8842", customerName: "Rohit Gupta", service: "Hotel", route: "Taj Palace, Delhi - 2N", travelDate: "2025-01-22", amount: 18900, commission: 945, status: "Ticketed", paymentStatus: "Paid", paymentMethod: "UPI", agent: "Rahul Khanna", agency: "Wanderlust Travels", createdAt: "2025-01-18" },
  { id: "bk-3", bookingRef: "BK-8843", customerName: "Anjali Desai", service: "Holiday", route: "Goa Beach Party - 3N", travelDate: "2025-02-08", amount: 14999, commission: 1500, status: "Pending", paymentStatus: "Partial", paymentMethod: "Razorpay", agent: "Sneha Reddy", agency: "Wanderlust Travels", createdAt: "2025-01-19" },
  { id: "bk-4", bookingRef: "BK-8844", customerName: "TechCorp India", service: "Flight", route: "BLR → DXB → BLR", travelDate: "2025-01-25", amount: 124000, commission: 6200, status: "Ticketed", paymentStatus: "Paid", paymentMethod: "Bank Transfer", agent: "Deepa Rao", agency: "Wanderlust Travels", createdAt: "2025-01-19" },
  { id: "bk-8", bookingRef: "BK-8848", customerName: "Nisha Agarwal", service: "Flight", route: "CCU → BKK → CCU", travelDate: "2025-02-20", amount: 42000, commission: 2100, status: "Cancelled", paymentStatus: "Refunded", paymentMethod: "Card", agent: "Deepa Rao", agency: "Wanderlust Travels", createdAt: "2025-01-10" },
  { id: "bk-9", bookingRef: "BK-8849", customerName: "Kavya Reddy", service: "Hotel", route: "W Goa - 3N", travelDate: "2025-02-12", amount: 78000, commission: 3900, status: "Confirmed", paymentStatus: "Paid", paymentMethod: "Razorpay", agent: "Sneha Reddy", agency: "Wanderlust Travels", createdAt: "2025-01-19" },
  { id: "bk-10", bookingRef: "BK-8850", customerName: "Vivek Sharma", service: "Holiday", route: "Bali Bliss - 6N", travelDate: "2025-04-05", amount: 99998, commission: 10000, status: "Pending", paymentStatus: "Pending", agent: "Sneha Reddy", agency: "Wanderlust Travels", createdAt: "2025-01-20" },
  { id: "bk-11", bookingRef: "BK-8851", customerName: "Pooja Mehta", service: "Flight", route: "MUM → DXB → MUM", travelDate: "2025-03-15", amount: 45000, commission: 2250, status: "Confirmed", paymentStatus: "Paid", paymentMethod: "Razorpay", agent: "Sneha Reddy", agency: "Wanderlust Travels", createdAt: "2025-01-20" },
  { id: "bk-12", bookingRef: "BK-8852", customerName: "Sanjay Kumar", service: "Flight", route: "DEL → SIN → DEL", travelDate: "2025-05-02", amount: 72000, commission: 3600, status: "Failed", paymentStatus: "Pending", agent: "Deepa Rao", agency: "Wanderlust Travels", createdAt: "2025-01-20" },
];

export const PAYMENTS: Payment[] = [
  { id: "py-1", txnId: "pay_Nx7K2mQ9", customerName: "Karthik Venkat", bookingRef: "BK-8841", amount: 28400, method: "Razorpay", status: "Success", type: "Payment", date: "2025-01-12", gateway: "Razorpay" },
  { id: "py-2", txnId: "pay_PmL4vR1", customerName: "Rohit Gupta", bookingRef: "BK-8842", amount: 18900, method: "UPI", status: "Success", type: "Payment", date: "2025-01-18", gateway: "Razorpay" },
  { id: "py-3", txnId: "pay_Q8nW3xK", customerName: "Anjali Desai", bookingRef: "BK-8843", amount: 7500, method: "Razorpay", status: "Success", type: "Payment", date: "2025-01-19", gateway: "Razorpay" },
  { id: "py-4", txnId: "pay_R2pM9yL", customerName: "TechCorp India", bookingRef: "BK-8844", amount: 124000, method: "Bank Transfer", status: "Success", type: "Payment", date: "2025-01-19", gateway: "Manual" },
  { id: "py-5", txnId: "pay_S5kN2wP", customerName: "Imran Khan", bookingRef: "BK-8845", amount: 1700, method: "UPI", status: "Success", type: "Payment", date: "2025-01-15", gateway: "Razorpay" },
  { id: "py-6", txnId: "pay_T3jH7qF", customerName: "Nisha Agarwal", bookingRef: "BK-8848", amount: 42000, method: "Card", status: "Refunded", type: "Refund", date: "2025-01-12", gateway: "Razorpay" },
  { id: "py-7", txnId: "pay_U1xG6rV", customerName: "Kavya Reddy", bookingRef: "BK-8849", amount: 78000, method: "Razorpay", status: "Success", type: "Payment", date: "2025-01-19", gateway: "Razorpay" },
  { id: "py-8", txnId: "pay_V8mB4zT", customerName: "Suresh Pillai", bookingRef: "BK-8847", amount: 8500, method: "Razorpay", status: "Success", type: "Payment", date: "2025-01-14", gateway: "Razorpay" },
  { id: "py-9", txnId: "pay_W2dK9nY", customerName: "Pooja Mehta", bookingRef: "BK-8851", amount: 45000, method: "Razorpay", status: "Success", type: "Payment", date: "2025-01-20", gateway: "Razorpay" },
  { id: "py-10", txnId: "pay_X7pL3mH", customerName: "Vivek Sharma", bookingRef: "BK-8850", amount: 0, method: "Razorpay", status: "Pending", type: "Payment", date: "2025-01-20", gateway: "Razorpay" },
];

export const WALLET_TXNS: WalletTransaction[] = [
  { id: "wt-1", type: "Credit", source: "Commission", amount: 1420, balance: 845000, description: "Commission: BK-8841 (Flight)", date: "2025-01-12" },
  { id: "wt-2", type: "Credit", source: "Commission", amount: 945, balance: 843580, description: "Commission: BK-8842 (Hotel)", date: "2025-01-18" },
  { id: "wt-3", type: "Debit", source: "Booking", amount: 14999, balance: 842635, description: "Booking payment: BK-8843", date: "2025-01-19" },
  { id: "wt-4", type: "Credit", source: "Commission", amount: 6200, balance: 857634, description: "Commission: BK-8844 (Corporate Flight)", date: "2025-01-19" },
  { id: "wt-5", type: "Credit", source: "Top-up", amount: 100000, balance: 863834, description: "Wallet top-up via Razorpay", date: "2025-01-19" },
  { id: "wt-6", type: "Debit", source: "Refund", amount: 42000, balance: 863834, description: "Refund processed: BK-8848", date: "2025-01-12" },
  { id: "wt-7", type: "Credit", source: "Commission", amount: 3900, balance: 845000, description: "Commission: BK-8849 (Luxury Hotel)", date: "2025-01-19" },
];

export const EMPLOYEES: Employee[] = [
  { id: "em-1", name: "Sneha Reddy", email: "sneha@wanderlusttravels.in", phone: "+91 98400 33333", designation: "Senior Travel Consultant", department: "Sales", branch: "Mumbai - Andheri", role: "employee", status: "Active", salary: 45000, incentives: 18000, target: 500000, achieved: 612000, attendance: 96, joinDate: "2023-03-15" },
  { id: "em-2", name: "Rahul Khanna", email: "rahul@wanderlusttravels.in", phone: "+91 98112 44556", designation: "Branch Manager", department: "Management", branch: "Delhi - CP", role: "branch_manager", status: "Active", salary: 75000, incentives: 25000, target: 1500000, achieved: 1120000, attendance: 98, joinDate: "2022-06-20" },
  { id: "em-3", name: "Deepa Rao", email: "deepa@wanderlusttravels.in", phone: "+91 98113 55667", designation: "Travel Consultant", department: "Sales", branch: "Bangalore - Indiranagar", role: "employee", status: "Active", salary: 38000, incentives: 12000, target: 400000, achieved: 358000, attendance: 92, joinDate: "2023-08-10" },
  { id: "em-4", name: "Vikram Iyer", email: "vikram@wanderlusttravels.in", phone: "+91 98114 66778", designation: "Finance Manager", department: "Accounts", branch: "Mumbai - Andheri", role: "accountant", status: "Active", salary: 62000, incentives: 8000, target: 0, achieved: 0, attendance: 99, joinDate: "2022-11-05" },
  { id: "em-5", name: "Suresh Babu", email: "suresh@wanderlusttravels.in", phone: "+91 98115 77889", designation: "Branch Manager", department: "Management", branch: "Chennai - T. Nagar", role: "branch_manager", status: "On Leave", salary: 68000, incentives: 15000, target: 800000, achieved: 210000, attendance: 88, joinDate: "2023-01-18" },
  { id: "em-6", name: "Aisha Khan", email: "aisha@wanderlusttravels.in", phone: "+91 98116 88990", designation: "Holiday Package Specialist", department: "Operations", branch: "Mumbai - Andheri", role: "employee", status: "Active", salary: 40000, incentives: 14000, target: 300000, achieved: 287000, attendance: 95, joinDate: "2023-05-22" },
  { id: "em-7", name: "Nikhil Joshi", email: "nikhil@wanderlusttravels.in", phone: "+91 98117 99001", designation: "Support Executive", department: "Support", branch: "Delhi - CP", role: "employee", status: "Active", salary: 32000, incentives: 6000, target: 0, achieved: 0, attendance: 94, joinDate: "2024-02-01" },
  { id: "em-8", name: "Priya Nair", email: "priya.n@wanderlusttravels.in", phone: "+91 98118 11223", designation: "Holiday Package Expert", department: "Sales", branch: "Bangalore - Indiranagar", role: "employee", status: "Active", salary: 42000, incentives: 16000, target: 450000, achieved: 498000, attendance: 97, joinDate: "2023-04-08" },
];

export const TASKS: Task[] = [
  { id: "tk-1", title: "Follow up with Vivek Sharma - Bali package", description: "Send revised quotation with private pool villa option", assignedTo: "Sneha Reddy", assignedBy: "Arjun Nair", priority: "High", status: "In Progress", dueDate: "2025-01-22", relatedTo: "LD-1", createdAt: "2025-01-19" },
  { id: "tk-2", title: "Confirm Bali villa upgrade", description: "Verify private pool villa availability for Vivek Sharma's Bali package", assignedTo: "Aisha Khan", assignedBy: "Arjun Nair", priority: "Urgent", status: "To Do", dueDate: "2025-01-23", relatedTo: "LD-1", createdAt: "2025-01-19" },
  { id: "tk-3", title: "Corporate rate negotiation - TechCorp", description: "Finalize annual corporate travel contract with TechCorp India", assignedTo: "Deepa Rao", assignedBy: "Priya Sharma", priority: "High", status: "Review", dueDate: "2025-01-25", createdAt: "2025-01-15" },
  { id: "tk-4", title: "Prepare weekly sales report", description: "Compile branch-wise sales performance for management review", assignedTo: "Sneha Reddy", assignedBy: "Arjun Nair", priority: "Medium", status: "Completed", dueDate: "2025-01-20", createdAt: "2025-01-18" },
  { id: "tk-5", title: "Refund follow-up - BK-8848", description: "Check with Razorpay for refund status of Nisha Agarwal's cancelled booking", assignedTo: "Vikram Iyer", assignedBy: "Deepa Rao", priority: "Medium", status: "In Progress", dueDate: "2025-01-21", relatedTo: "BK-8848", createdAt: "2025-01-16" },
  { id: "tk-6", title: "Call Sanjay Kumar - group discount", description: "Offer final discount and close Singapore group deal", assignedTo: "Deepa Rao", assignedBy: "Rahul Khanna", priority: "High", status: "To Do", dueDate: "2025-01-22", relatedTo: "LD-5", createdAt: "2025-01-20" },
];

export const QUOTATIONS: Quotation[] = [
  { id: "qt-1", quoteNo: "QT-2025-014", customerName: "Vivek Sharma", service: "Holiday", items: 3, amount: 92000, gst: 16560, total: 108560, status: "Sent", validTill: "2025-01-28", createdBy: "Sneha Reddy", createdAt: "2025-01-19" },
  { id: "qt-2", quoteNo: "QT-2025-015", customerName: "Pooja Mehta", service: "Flight", items: 4, amount: 42000, gst: 7560, total: 49560, status: "Accepted", validTill: "2025-01-25", createdBy: "Sneha Reddy", createdAt: "2025-01-17" },
  { id: "qt-3", quoteNo: "QT-2025-016", customerName: "Amit Patel", service: "Holiday", items: 2, amount: 440000, gst: 79200, total: 519200, status: "Draft", validTill: "2025-02-15", createdBy: "Rahul Khanna", createdAt: "2025-01-18" },
  { id: "qt-4", quoteNo: "QT-2025-017", customerName: "Kavya Reddy", service: "Hotel", items: 2, amount: 72000, gst: 12960, total: 84960, status: "Accepted", validTill: "2025-01-24", createdBy: "Sneha Reddy", createdAt: "2025-01-15" },
  { id: "qt-5", quoteNo: "QT-2025-018", customerName: "Sanjay Kumar", service: "Flight", items: 6, amount: 68000, gst: 12240, total: 80240, status: "Sent", validTill: "2025-01-26", createdBy: "Deepa Rao", createdAt: "2025-01-18" },
  { id: "qt-6", quoteNo: "QT-2025-013", customerName: "Manoj Joshi", service: "Holiday", items: 1, amount: 79998, gst: 14399, total: 94397, status: "Expired", validTill: "2025-01-15", createdBy: "Rahul Khanna", createdAt: "2025-01-05" },
];

export const NOTIFICATIONS: Notification[] = [
  { id: "nt-1", type: "booking", title: "New Booking Confirmed", message: "BK-8849 - Kavya Reddy booked W Goa for ₹78,000", time: "5 min ago", read: false, priority: "high" },
  { id: "nt-2", type: "payment", title: "Payment Received", message: "₹45,000 received from Pooja Mehta via Razorpay", time: "20 min ago", read: false, priority: "high" },
  { id: "nt-3", type: "api", title: "Flight API Rate Limit", message: "IndiGo API usage at 82% of daily quota", time: "1 hour ago", read: false, priority: "medium" },
  { id: "nt-4", type: "customer", title: "New Enquiry", message: "Manoj Joshi enquired about Andaman package", time: "2 hours ago", read: true, priority: "medium" },
  { id: "nt-5", type: "internal", title: "Task Assigned", message: "Arjun Nair assigned you: Follow up with Vivek Sharma", time: "3 hours ago", read: true, priority: "low" },
  { id: "nt-6", type: "booking", title: "Booking Pending Approval", message: "BK-8850 (₹99,998) needs approval - above limit", time: "4 hours ago", read: false, priority: "high" },
  { id: "nt-7", type: "payment", title: "Refund Processed", message: "₹42,000 refunded to Nisha Agarwal (BK-8848)", time: "6 hours ago", read: true, priority: "medium" },
  { id: "nt-8", type: "api", title: "Hotel API Sync Complete", message: "2,340 properties synced from Booking.com API", time: "8 hours ago", read: true, priority: "low" },
];

// Revenue chart data (last 12 months)
export const REVENUE_DATA = [
  { month: "Feb", revenue: 1850000, bookings: 240, commission: 95000 },
  { month: "Mar", revenue: 2100000, bookings: 285, commission: 108000 },
  { month: "Apr", revenue: 1950000, bookings: 268, commission: 102000 },
  { month: "May", revenue: 2350000, bookings: 312, commission: 121000 },
  { month: "Jun", revenue: 2680000, bookings: 358, commission: 138000 },
  { month: "Jul", revenue: 2950000, bookings: 392, commission: 152000 },
  { month: "Aug", revenue: 2820000, bookings: 375, commission: 146000 },
  { month: "Sep", revenue: 3120000, bookings: 410, commission: 161000 },
  { month: "Oct", revenue: 3450000, bookings: 458, commission: 178000 },
  { month: "Nov", revenue: 3280000, bookings: 432, commission: 169000 },
  { month: "Dec", revenue: 3850000, bookings: 512, commission: 198000 },
  { month: "Jan", revenue: 2850000, bookings: 378, commission: 147000 },
];

export const BOOKING_TYPE_DATA = [
  { name: "Flights", value: 1450, color: "var(--chart-1)" },
  { name: "Hotels", value: 980, color: "var(--chart-2)" },
  { name: "Holidays", value: 420, color: "var(--chart-3)" },
];

export const ENQUIRY_SOURCE_DATA = [
  { source: "Website", count: 145 },
  { source: "WhatsApp", count: 132 },
  { source: "Phone", count: 89 },
  { source: "Google Ads", count: 76 },
  { source: "Instagram", count: 58 },
  { source: "Facebook", count: 42 },
  { source: "Referral", count: 35 },
  { source: "Walk-in", count: 28 },
];

export const TOP_DESTINATIONS = [
  { destination: "Dubai", bookings: 342, revenue: 1850000, growth: 18 },
  { destination: "Goa", bookings: 289, revenue: 920000, growth: 12 },
  { destination: "Bali", bookings: 198, revenue: 1240000, growth: 24 },
  { destination: "Singapore", bookings: 167, revenue: 1380000, growth: 15 },
  { destination: "Thailand", bookings: 234, revenue: 1050000, growth: 8 },
  { destination: "Kashmir", bookings: 156, revenue: 680000, growth: 22 },
];

export const RECENT_ACTIVITIES = [
  { id: "ac-1", user: "Sneha Reddy", action: "confirmed booking", target: "BK-8849 (W Goa)", time: "5 min ago", type: "booking" },
  { id: "ac-2", user: "System", action: "received payment", target: "₹45,000 via Razorpay", time: "20 min ago", type: "payment" },
  { id: "ac-3", user: "Deepa Rao", action: "created quotation", target: "QT-2025-018", time: "45 min ago", type: "quotation" },
  { id: "ac-4", user: "Vikram Iyer", action: "processed refund", target: "BK-8848 (₹42,000)", time: "1 hour ago", type: "refund" },
  { id: "ac-5", user: "Aisha Khan", action: "updated package itinerary", target: "BK-8850 - Villa upgrade confirmed", time: "2 hours ago", type: "booking" },
  { id: "ac-6", user: "Rahul Khanna", action: "assigned task", target: "to Deepa Rao", time: "3 hours ago", type: "task" },
];
