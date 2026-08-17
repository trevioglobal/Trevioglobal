"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plane, Search, ArrowLeftRight, Calendar, Users, ChevronRight,
  Clock, Star, Filter, Loader2,
  CreditCard, Smartphone, Building2, Wallet, ShieldCheck,
  Plus, Minus, ArrowRight, PlaneTakeoff, PlaneLanding, Tag,
  CheckCircle2, RefreshCw, Crown, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatFullINR, formatPrettyDate, PageShell } from "@/components/shared/ui-helpers";
import { generateFlights } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { mapApiFlight } from "@/lib/api-mappers";
import { useDemoDataStore } from "@/store/demo-data-store";
import { payWithRazorpay } from "@/lib/razorpay";
import { ShareTicket } from "@/components/shared/share-ticket";
import type { Flight } from "@/types";

/* ----------------------------- Constants ----------------------------- */

interface Airport {
  code: string;
  city: string;
  name: string;
  country: string;
  popular?: boolean;
}

const AIRPORTS: Airport[] = [
  { code: "BOM", city: "Mumbai", name: "Chhatrapati Shivaji Maharaj Intl", country: "India", popular: true },
  { code: "DEL", city: "New Delhi", name: "Indira Gandhi Intl", country: "India", popular: true },
  { code: "BLR", city: "Bangalore", name: "Kempegowda Intl", country: "India", popular: true },
  { code: "MAA", city: "Chennai", name: "Chennai Intl", country: "India", popular: true },
  { code: "HYD", city: "Hyderabad", name: "Rajiv Gandhi Intl", country: "India", popular: true },
  { code: "CCU", city: "Kolkata", name: "Netaji Subhas Chandra Bose Intl", country: "India", popular: true },
  { code: "GOI", city: "Goa", name: "Dabolim Airport", country: "India", popular: true },
  { code: "GOX", city: "Goa", name: "Manohar Intl (Mopa)", country: "India" },
  { code: "COK", city: "Kochi", name: "Cochin Intl", country: "India" },
  { code: "PNQ", city: "Pune", name: "Pune Airport", country: "India" },
  { code: "AMD", city: "Ahmedabad", name: "Sardar Vallabhbhai Patel Intl", country: "India" },
  { code: "JAI", city: "Jaipur", name: "Jaipur Intl", country: "India" },
  { code: "LKO", city: "Lucknow", name: "Chaudhary Charan Singh Intl", country: "India" },
  { code: "IXC", city: "Chandigarh", name: "Chandigarh Airport", country: "India" },
  { code: "GAU", city: "Guwahati", name: "Lokpriya Gopinath Bordoloi Intl", country: "India" },
  { code: "PAT", city: "Patna", name: "Jay Prakash Narayan Airport", country: "India" },
  { code: "BBI", city: "Bhubaneswar", name: "Biju Patnaik Intl", country: "India" },
  { code: "IXZ", city: "Port Blair", name: "Veer Savarkar Intl", country: "India" },
  { code: "SXR", city: "Srinagar", name: "Sheikh ul-Alam Intl", country: "India" },
  { code: "IXB", city: "Bagdogra", name: "Bagdogra Airport", country: "India" },
  { code: "TRV", city: "Thiruvananthapuram", name: "Trivandrum Intl", country: "India" },
  { code: "IXM", city: "Madurai", name: "Madurai Airport", country: "India" },
  { code: "VNS", city: "Varanasi", name: "Lal Bahadur Shastri Airport", country: "India" },
  { code: "NAG", city: "Nagpur", name: "Dr. Babasaheb Ambedkar Intl", country: "India" },
  { code: "IDR", city: "Indore", name: "Devi Ahilyabai Holkar Airport", country: "India" },
  { code: "RPR", city: "Raipur", name: "Swami Vivekananda Airport", country: "India" },
  { code: "UDR", city: "Udaipur", name: "Maharana Pratap Airport", country: "India" },
  { code: "ATQ", city: "Amritsar", name: "Sri Guru Ram Dass Jee Intl", country: "India" },
  { code: "DXB", city: "Dubai", name: "Dubai Intl", country: "UAE", popular: true },
  { code: "AUH", city: "Abu Dhabi", name: "Zayed Intl", country: "UAE" },
  { code: "SHJ", city: "Sharjah", name: "Sharjah Intl", country: "UAE" },
  { code: "SIN", city: "Singapore", name: "Changi Airport", country: "Singapore", popular: true },
  { code: "BKK", city: "Bangkok", name: "Suvarnabhumi Airport", country: "Thailand", popular: true },
  { code: "DMK", city: "Bangkok", name: "Don Mueang Intl", country: "Thailand" },
  { code: "HKT", city: "Phuket", name: "Phuket Intl", country: "Thailand" },
  { code: "KUL", city: "Kuala Lumpur", name: "Kuala Lumpur Intl", country: "Malaysia" },
  { code: "LON", city: "London", name: "Heathrow Airport", country: "United Kingdom", popular: true },
  { code: "LGW", city: "London", name: "Gatwick Airport", country: "United Kingdom" },
  { code: "LTN", city: "London", name: "Luton Airport", country: "United Kingdom" },
  { code: "MAN", city: "Manchester", name: "Manchester Airport", country: "United Kingdom" },
  { code: "EDI", city: "Edinburgh", name: "Edinburgh Airport", country: "United Kingdom" },
  { code: "DUB", city: "Dublin", name: "Dublin Airport", country: "Ireland" },
  { code: "JFK", city: "New York", name: "John F. Kennedy Intl", country: "USA", popular: true },
  { code: "EWR", city: "New York", name: "Newark Liberty Intl", country: "USA" },
  { code: "LGA", city: "New York", name: "LaGuardia Airport", country: "USA" },
  { code: "SFO", city: "San Francisco", name: "San Francisco Intl", country: "USA" },
  { code: "LAX", city: "Los Angeles", name: "Los Angeles Intl", country: "USA", popular: true },
  { code: "ORD", city: "Chicago", name: "O'Hare Intl", country: "USA" },
  { code: "SEA", city: "Seattle", name: "Seattle-Tacoma Intl", country: "USA" },
  { code: "IAD", city: "Washington D.C.", name: "Dulles Intl", country: "USA" },
  { code: "ATL", city: "Atlanta", name: "Hartsfield-Jackson Intl", country: "USA" },
  { code: "MIA", city: "Miami", name: "Miami Intl", country: "USA" },
  { code: "BOS", city: "Boston", name: "Logan Intl", country: "USA" },
  { code: "IAH", city: "Houston", name: "George Bush Intercontinental", country: "USA" },
  { code: "DFW", city: "Dallas", name: "Dallas/Fort Worth Intl", country: "USA" },
  { code: "YYZ", city: "Toronto", name: "Toronto Pearson Intl", country: "Canada" },
  { code: "YVR", city: "Vancouver", name: "Vancouver Intl", country: "Canada" },
  { code: "YUL", city: "Montreal", name: "Montréal-Trudeau Intl", country: "Canada" },
  { code: "MEX", city: "Mexico City", name: "Mexico City Intl", country: "Mexico" },
  { code: "GRU", city: "São Paulo", name: "Guarulhos Intl", country: "Brazil" },
  { code: "GIG", city: "Rio de Janeiro", name: "Galeão Intl", country: "Brazil" },
  { code: "EZE", city: "Buenos Aires", name: "Ministro Pistarini Intl", country: "Argentina" },
  { code: "SCL", city: "Santiago", name: "Arturo Merino Benítez Intl", country: "Chile" },
  { code: "BOG", city: "Bogotá", name: "El Dorado Intl", country: "Colombia" },
  { code: "SYD", city: "Sydney", name: "Kingsford Smith Airport", country: "Australia", popular: true },
  { code: "MEL", city: "Melbourne", name: "Melbourne Airport", country: "Australia" },
  { code: "BNE", city: "Brisbane", name: "Brisbane Airport", country: "Australia" },
  { code: "PER", city: "Perth", name: "Perth Airport", country: "Australia" },
  { code: "AKL", city: "Auckland", name: "Auckland Airport", country: "New Zealand" },
  { code: "DOH", city: "Doha", name: "Hamad Intl", country: "Qatar", popular: true },
  { code: "KWI", city: "Kuwait City", name: "Kuwait Intl", country: "Kuwait" },
  { code: "BAH", city: "Manama", name: "Bahrain Intl", country: "Bahrain" },
  { code: "MCT", city: "Muscat", name: "Muscat Intl", country: "Oman" },
  { code: "RUH", city: "Riyadh", name: "King Khalid Intl", country: "Saudi Arabia" },
  { code: "JED", city: "Jeddah", name: "King Abdulaziz Intl", country: "Saudi Arabia" },
  { code: "IST", city: "Istanbul", name: "Istanbul Airport", country: "Turkey", popular: true },
  { code: "TLV", city: "Tel Aviv", name: "Ben Gurion Airport", country: "Israel" },
  { code: "CAI", city: "Cairo", name: "Cairo Intl", country: "Egypt" },
  { code: "JNB", city: "Johannesburg", name: "O.R. Tambo Intl", country: "South Africa" },
  { code: "CPT", city: "Cape Town", name: "Cape Town Intl", country: "South Africa" },
  { code: "NBO", city: "Nairobi", name: "Jomo Kenyatta Intl", country: "Kenya" },
  { code: "ADD", city: "Addis Ababa", name: "Bole Intl", country: "Ethiopia" },
  { code: "LOS", city: "Lagos", name: "Murtala Muhammed Intl", country: "Nigeria" },
  { code: "CDG", city: "Paris", name: "Charles de Gaulle Airport", country: "France", popular: true },
  { code: "ORY", city: "Paris", name: "Orly Airport", country: "France" },
  { code: "NCE", city: "Nice", name: "Côte d'Azur Airport", country: "France" },
  { code: "FRA", city: "Frankfurt", name: "Frankfurt Airport", country: "Germany", popular: true },
  { code: "MUC", city: "Munich", name: "Munich Airport", country: "Germany" },
  { code: "BER", city: "Berlin", name: "Berlin Brandenburg Airport", country: "Germany" },
  { code: "AMS", city: "Amsterdam", name: "Schiphol Airport", country: "Netherlands", popular: true },
  { code: "MAD", city: "Madrid", name: "Adolfo Suárez Madrid-Barajas", country: "Spain" },
  { code: "BCN", city: "Barcelona", name: "Barcelona-El Prat Airport", country: "Spain" },
  { code: "FCO", city: "Rome", name: "Leonardo da Vinci Intl", country: "Italy" },
  { code: "MXP", city: "Milan", name: "Malpensa Airport", country: "Italy" },
  { code: "ZRH", city: "Zurich", name: "Zurich Airport", country: "Switzerland" },
  { code: "VIE", city: "Vienna", name: "Vienna Intl", country: "Austria" },
  { code: "BRU", city: "Brussels", name: "Brussels Airport", country: "Belgium" },
  { code: "CPH", city: "Copenhagen", name: "Copenhagen Airport", country: "Denmark" },
  { code: "OSL", city: "Oslo", name: "Oslo Airport", country: "Norway" },
  { code: "ARN", city: "Stockholm", name: "Stockholm Arlanda", country: "Sweden" },
  { code: "HEL", city: "Helsinki", name: "Helsinki-Vantaa Airport", country: "Finland" },
  { code: "LIS", city: "Lisbon", name: "Humberto Delgado Airport", country: "Portugal" },
  { code: "ATH", city: "Athens", name: "Athens Intl", country: "Greece" },
  { code: "WAW", city: "Warsaw", name: "Warsaw Chopin Airport", country: "Poland" },
  { code: "PRG", city: "Prague", name: "Václav Havel Airport", country: "Czech Republic" },
  { code: "SVO", city: "Moscow", name: "Sheremetyevo Intl", country: "Russia" },
  { code: "HKG", city: "Hong Kong", name: "Hong Kong Intl", country: "Hong Kong", popular: true },
  { code: "NRT", city: "Tokyo", name: "Narita Intl", country: "Japan", popular: true },
  { code: "HND", city: "Tokyo", name: "Haneda Airport", country: "Japan" },
  { code: "KIX", city: "Osaka", name: "Kansai Intl", country: "Japan" },
  { code: "ICN", city: "Seoul", name: "Incheon Intl", country: "South Korea", popular: true },
  { code: "PEK", city: "Beijing", name: "Beijing Capital Intl", country: "China" },
  { code: "PVG", city: "Shanghai", name: "Shanghai Pudong Intl", country: "China" },
  { code: "CAN", city: "Guangzhou", name: "Baiyun Intl", country: "China" },
  { code: "TPE", city: "Taipei", name: "Taoyuan Intl", country: "Taiwan" },
  { code: "MNL", city: "Manila", name: "Ninoy Aquino Intl", country: "Philippines" },
  { code: "CGK", city: "Jakarta", name: "Soekarno-Hatta Intl", country: "Indonesia" },
  { code: "DPS", city: "Bali", name: "Ngurah Rai Intl", country: "Indonesia", popular: true },
  { code: "SGN", city: "Ho Chi Minh City", name: "Tan Son Nhat Intl", country: "Vietnam" },
  { code: "HAN", city: "Hanoi", name: "Noi Bai Intl", country: "Vietnam" },
  { code: "RGN", city: "Yangon", name: "Yangon Intl", country: "Myanmar" },
  { code: "DAC", city: "Dhaka", name: "Hazrat Shahjalal Intl", country: "Bangladesh" },
  { code: "KTM", city: "Kathmandu", name: "Tribhuvan Intl", country: "Nepal" },
  { code: "CMB", city: "Colombo", name: "Bandaranaike Intl", country: "Sri Lanka" },
  { code: "MLE", city: "Malé", name: "Velana Intl", country: "Maldives", popular: true },
  { code: "ISB", city: "Islamabad", name: "Islamabad Intl", country: "Pakistan" },
  { code: "KHI", city: "Karachi", name: "Jinnah Intl", country: "Pakistan" },
];

function airportByCode(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code);
}

function searchAirports(query: string, excludeCode?: string): Airport[] {
  const pool = AIRPORTS.filter((a) => a.code !== excludeCode);
  const q = query.trim().toLowerCase();
  if (!q) return pool.filter((a) => a.popular).slice(0, 8);
  return pool
    .filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      const aStarts = a.code.toLowerCase() === q || a.city.toLowerCase().startsWith(q);
      const bStarts = b.code.toLowerCase() === q || b.city.toLowerCase().startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.city.localeCompare(b.city);
    })
    .slice(0, 8);
}

const CABIN_CLASSES = ["Economy", "Premium Economy", "Business", "First"] as const;

const QUICK_ROUTES = [
  { from: "BOM", to: "DEL", label: "Mumbai → Delhi" },
  { from: "DEL", to: "GOI", label: "Delhi → Goa" },
  { from: "BLR", to: "BOM", label: "Bengaluru → Mumbai" },
  { from: "DEL", to: "SIN", label: "Delhi → Singapore" },
  { from: "BOM", to: "KUL", label: "Mumbai → Kuala Lumpur" },
  { from: "MAA", to: "BKK", label: "Chennai → Bangkok" },
  { from: "BLR", to: "DPS", label: "Bengaluru → Bali" },
  { from: "DEL", to: "SGN", label: "Delhi → Ho Chi Minh City" },
  { from: "HYD", to: "DXB", label: "Hyderabad → Dubai" },
];

const AIRLINE_GRADIENTS: Record<string, string> = {
  "6E": "from-orange-400 to-rose-500",
  AI: "from-rose-400 to-red-500",
  UK: "from-violet-400 to-purple-500",
  SG: "from-rose-400 to-orange-500",
  QP: "from-amber-400 to-orange-500",
  IX: "from-rose-400 to-amber-500",
  EK: "from-red-400 to-rose-600",
  SQ: "from-brand-blue to-brand-teal",
  QR: "from-violet-400 to-fuchsia-500",
  AK: "from-red-400 to-orange-500",
  MH: "from-blue-400 to-red-500",
  TG: "from-purple-400 to-violet-600",
  FD: "from-red-400 to-pink-500",
  VJ: "from-red-500 to-yellow-500",
  VN: "from-blue-400 to-emerald-500",
  GA: "from-teal-400 to-blue-500",
  TR: "from-yellow-400 to-orange-500",
};

const SEAT_LETTERS = ["A", "B", "C", "D", "E", "F"];
const TOTAL_ROWS = 18;
const SEAT_PRICE = 500;

// Deterministic "booked" seats (no hydration mismatch)
const BOOKED_SEATS = new Set([
  "1A", "1F", "2C", "3B", "4D", "5A", "5F", "6C", "7B", "8D",
  "9A", "9E", "10B", "11C", "12D", "13A", "13F", "14B", "15C",
  "16D", "17A", "18F", "3E", "6F", "11A",
]);

const TIME_BANDS = [
  { id: "early", label: "Before 6 AM", range: [0, 6] },
  { id: "morning", label: "6 AM – 12 PM", range: [6, 12] },
  { id: "afternoon", label: "12 PM – 6 PM", range: [12, 18] },
  { id: "evening", label: "After 6 PM", range: [18, 24] },
];

type Step = "search" | "results";
type SortKey = "cheapest" | "fastest" | "earliest";
type PayMethod = "card" | "upi" | "netbanking" | "wallet";

/* ----------------------------- Helpers ----------------------------- */

function durationToMinutes(dur: string): number {
  const m = dur.match(/(\d+)h\s*(\d+)?m?/);
  if (!m) return 0;
  return parseInt(m[1] || "0") * 60 + parseInt(m[2] || "0");
}

function timeToHour(t: string): number {
  return parseInt(t.slice(0, 2));
}

function airlineGradient(code: string): string {
  return AIRLINE_GRADIENTS[code] ?? "from-brand-blue to-brand-teal";
}

/* ============================ Main View ============================ */

export function FlightsView() {
  const { toast } = useToast();
  const addBooking = useDemoDataStore((s) => s.addBooking);
  const walletBalance = useDemoDataStore((s) => s.walletBalance);
  const walletTransfer = useDemoDataStore((s) => s.walletTransfer);

  /* Search state */
  const [tripType, setTripType] = useState<"oneway" | "round" | "multi">("oneway");
  const [from, setFrom] = useState("BOM");
  const [to, setTo] = useState("DEL");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [childrenCount, setChildrenCount] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabin, setCabin] = useState<string>("Economy");

  /* Results state */
  const [step, setStep] = useState<Step>("search");
  const [results, setResults] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);

  /* Filters */
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 30000]);
  const [stopFilter, setStopFilter] = useState<"all" | "nonstop" | "one">("all");
  const [airlineFilter, setAirlineFilter] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("cheapest");
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  /* Seat selection */
  const [seatDialog, setSeatDialog] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  /* Review + payment */
  const [reviewDialog, setReviewDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [travellerName, setTravellerName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const paxCount = adults + childrenCount;
  const maxPrice = useMemo(() => Math.max(30000, ...results.map((r) => r.price)), [results]);
  const minPrice = useMemo(() => Math.min(0, ...results.map((r) => r.price)), [results]);

  const uniqueAirlines = useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((r) => map.set(r.airlineCode, r.airline));
    return Array.from(map.entries());
  }, [results]);

  const filteredResults = useMemo(() => {
    let r = results.filter((f) => {
      if (f.price < priceRange[0] || f.price > priceRange[1]) return false;
      if (stopFilter === "nonstop" && f.stops > 0) return false;
      if (stopFilter === "one" && f.stops !== 1) return false;
      if (airlineFilter.length && !airlineFilter.includes(f.airlineCode)) return false;
      if (timeFilter.length) {
        const hr = timeToHour(f.departTime);
        const inBand = TIME_BANDS.some((b) => {
          if (!timeFilter.includes(b.id)) return false;
          return hr >= b.range[0] && hr < b.range[1];
        });
        if (!inBand) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) => {
      if (sortBy === "cheapest") return a.price - b.price;
      if (sortBy === "fastest") return durationToMinutes(a.duration) - durationToMinutes(b.duration);
      return a.departTime.localeCompare(b.departTime);
    });
    return r;
  }, [results, priceRange, stopFilter, airlineFilter, timeFilter, sortBy]);

  /* Actions */
  function handleSearch() {
    if (from === to) {
      toast({
        title: "Same city selected",
        description: "Origin and destination cannot be the same.",
        variant: "destructive",
      });
      return;
    }
    if (!departDate) {
      toast({
        title: "Select departure date",
        description: "Please pick a date for your trip.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await api.searchFlights(from, to, 8);
        const r = res.flights.map(mapApiFlight);
        setResults(r);
        const prices = r.map((f) => f.price);
        setPriceRange([Math.min(...prices), Math.max(...prices)]);
      } catch {
        const r = generateFlights(from, to, 8);
        setResults(r);
        const prices = r.map((f) => f.price);
        setPriceRange([Math.min(...prices), Math.max(...prices)]);
      }
      setAirlineFilter([]);
      setStopFilter("all");
      setTimeFilter([]);
      setStep("results");
      setLoading(false);
    })();
  }

  function swapCities() {
    setFrom(to);
    setTo(from);
  }

  function pickQuickRoute(route: { from: string; to: string }) {
    setFrom(route.from);
    setTo(route.to);
    if (!departDate) {
      const today = new Date();
      today.setDate(today.getDate() + 7);
      setDepartDate(today.toISOString().slice(0, 10));
    }
    handleSearch();
  }

  function toggleSeat(seatId: string) {
    if (BOOKED_SEATS.has(seatId)) return;
    setSelectedSeats((cur) =>
      cur.includes(seatId) ? cur.filter((s) => s !== seatId) : [...cur, seatId]
    );
  }

  function openSeatSelection(flight: Flight) {
    setSelectedFlight(flight);
    setSelectedSeats([]);
    setSeatDialog(true);
  }

  function continueToReview() {
    setSeatDialog(false);
    setReviewDialog(true);
  }

  function openPayment() {
    if (!travellerName.trim()) {
      toast({
        title: "Traveller name required",
        description: "Please add at least one traveller's name.",
        variant: "destructive",
      });
      return;
    }
    if (!contactEmail.trim() || !contactPhone.trim()) {
      toast({
        title: "Contact details required",
        description: "Please enter email and phone.",
        variant: "destructive",
      });
      return;
    }
    setReviewDialog(false);
    setPaymentDialog(true);
    setPaySuccess(false);
    setPaying(false);
  }

  async function processPayment() {
    const description = `Flight ${selectedFlight?.flightNumber ?? ""} • ${selectedSeats.length} seat(s)`;
    let paidMethod: "Wallet" | "Razorpay" = "Razorpay";

    if (payMethod === "wallet") {
      if (totalFare > walletBalance) {
        toast({
          title: "Insufficient wallet balance",
          description: `Your wallet has ${formatFullINR(walletBalance)}, but this booking costs ${formatFullINR(totalFare)}.`,
          variant: "destructive",
        });
        return;
      }
      setPaying(true);
      walletTransfer(totalFare, description);
      paidMethod = "Wallet";
    } else {
      setPaying(true);
      const result = await payWithRazorpay({ amount: totalFare, name: "Trevio Global", description, prefillEmail: contactEmail, prefillContact: contactPhone });
      if (!result.success) {
        setPaying(false);
        toast({ title: "Payment cancelled or failed", description: result.error || "No amount was charged.", variant: "destructive" });
        return;
      }
      if (result.demo) {
        toast({ title: "Checkout not configured", description: "Razorpay live keys are not set — this booking was recorded without a charge." });
      }
    }

    setPaying(false);
    setPaySuccess(true);
    if (selectedFlight) {
      addBooking({
        customerName: travellerName,
        service: "Flight",
        route: `${selectedFlight.originCity} → ${selectedFlight.destinationCity}`,
        travelDate: departDate,
        amount: totalFare,
        paymentMethod: paidMethod,
      });
    }
    setTimeout(() => {
      resetAll();
    }, 6000);
  }

  function resetAll() {
    setPaymentDialog(false);
    setReviewDialog(false);
    setSeatDialog(false);
    setStep("search");
    setSelectedFlight(null);
    setSelectedSeats([]);
    setTravellerName("");
    setContactEmail("");
    setContactPhone("");
    setPaySuccess(false);
    setPaying(false);
  }

  /* Fare calculation */
  const baseFare = selectedFlight ? selectedFlight.price * paxCount : 0;
  const seatCharges = selectedSeats.length * SEAT_PRICE;
  const taxes = Math.round(baseFare * 0.12);
  const totalFare = baseFare + taxes + seatCharges;

  /* ============================ Render ============================ */
  return (
    <PageShell>
      <SearchPanel
        tripType={tripType} setTripType={setTripType}
        from={from} setFrom={setFrom}
        to={to} setTo={setTo}
        swapCities={swapCities}
        departDate={departDate} setDepartDate={setDepartDate}
        returnDate={returnDate} setReturnDate={setReturnDate}
        adults={adults} setAdults={setAdults}
        childrenCount={childrenCount} setChildrenCount={setChildrenCount}
        infants={infants} setInfants={setInfants}
        cabin={cabin} setCabin={setCabin}
        onSearch={handleSearch}
        loading={loading}
      />

      {/* Quick route chips on search screen */}
      {step === "search" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground shrink-0">
            Popular
          </span>
          {QUICK_ROUTES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => pickQuickRoute(r)}
              className="px-3.5 py-2 rounded-full text-xs font-medium border border-border/80 bg-card shadow-xs hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all whitespace-nowrap min-h-[40px] touch-manipulation"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === "search" && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <EmptyState onPick={pickQuickRoute} />
          </motion.div>
        )}

        {step === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {/* Search summary bar */}
            <Card className="mb-4 rounded-2xl border-border/80 bg-card shadow-sm">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="text-lg">{from}</span>
                    <ArrowRight className="w-4 h-4 text-primary" />
                    <span className="text-lg">{to}</span>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    {formatPrettyDate(departDate)}
                    {tripType === "round" && returnDate && (
                      <> → {formatPrettyDate(returnDate)}</>
                    )}
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {paxCount} Pax · {cabin}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("search")}
                  className="gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Modify
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
              {/* Filter sidebar (desktop) */}
              <aside className="hidden lg:block">
                <FilterPanel
                  priceRange={priceRange}
                  setPriceRange={setPriceRange}
                  minPrice={minPrice}
                  maxPrice={maxPrice}
                  stopFilter={stopFilter}
                  setStopFilter={setStopFilter}
                  uniqueAirlines={uniqueAirlines}
                  airlineFilter={airlineFilter}
                  setAirlineFilter={setAirlineFilter}
                  timeFilter={timeFilter}
                  setTimeFilter={setTimeFilter}
                />
              </aside>

              {/* Mobile filter trigger */}
              <div className="lg:hidden flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFiltersMobile(true)}
                  className="gap-1.5 min-h-[44px] touch-manipulation"
                >
                  <Filter className="w-4 h-4" /> Filters
                </Button>
                <SortControl sortBy={sortBy} setSortBy={setSortBy} />
              </div>

              {/* Results list */}
              <div>
                <div className="hidden lg:flex items-center justify-between mb-3">
                  <p className="text-sm text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{filteredResults.length}</span> of{" "}
                    {results.length} flights
                  </p>
                  <SortControl sortBy={sortBy} setSortBy={setSortBy} />
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <Card key={i} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="h-20 rounded-lg bg-muted animate-pulse" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : filteredResults.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Plane className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="font-medium">No flights match your filters</p>
                      <p className="text-sm text-muted-foreground mt-1">Try widening the price range or removing filters.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence>
                      {filteredResults.map((flight, idx) => (
                        <motion.div
                          key={flight.id}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                        >
                          <FlightCard
                            flight={flight}
                            onSelect={() => openSeatSelection(flight)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile filter sheet */}
      <Dialog open={showFiltersMobile} onOpenChange={setShowFiltersMobile}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto scroll-thin">
            <FilterPanel
              priceRange={priceRange}
              setPriceRange={setPriceRange}
              minPrice={minPrice}
              maxPrice={maxPrice}
              stopFilter={stopFilter}
              setStopFilter={setStopFilter}
              uniqueAirlines={uniqueAirlines}
              airlineFilter={airlineFilter}
              setAirlineFilter={setAirlineFilter}
              timeFilter={timeFilter}
              setTimeFilter={setTimeFilter}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowFiltersMobile(false)} className="w-full">
              Show {filteredResults.length} flights
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SEAT SELECTION DIALOG */}
      <Dialog open={seatDialog} onOpenChange={setSeatDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary" /> Select your seats
            </DialogTitle>
            <DialogDescription>
              {selectedFlight?.airline} · {selectedFlight?.flightNumber} ·{" "}
              {selectedFlight?.origin} → {selectedFlight?.destination} ·{" "}
              {selectedFlight?.departTime}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-4">
            {/* Seat map */}
            <div>
              <div className="rounded-t-[40%] border-2 border-primary/30 bg-gradient-to-b from-primary/5 to-transparent pt-3 pb-2 px-3">
                <p className="text-center text-[10px] font-semibold text-primary/70 tracking-widest mb-2">
                  ✈ FRONT OF AIRCRAFT
                </p>
                <div className="space-y-1.5 max-h-72 overflow-y-auto scroll-thin pr-1">
                  {Array.from({ length: TOTAL_ROWS }).map((_, rowIdx) => {
                    const rowNum = rowIdx + 1;
                    return (
                      <div key={rowNum} className="flex items-center gap-1 justify-center">
                        <div className="w-5 text-[10px] text-muted-foreground text-right pr-1">
                          {rowNum}
                        </div>
                        {SEAT_LETTERS.map((letter, idx) => {
                          const seatId = `${rowNum}${letter}`;
                          const isBooked = BOOKED_SEATS.has(seatId);
                          const isSelected = selectedSeats.includes(seatId);
                          const showAisleGap = idx === 3;
                          return (
                            <div key={seatId} className="flex items-center">
                              {showAisleGap && <div className="w-3" />}
                              <button
                                disabled={isBooked}
                                onClick={() => toggleSeat(seatId)}
                                title={`Seat ${seatId}${isBooked ? " (booked)" : ""}`}
                                className={cn(
                                  "size-7 rounded-md text-[10px] font-semibold transition-all flex items-center justify-center",
                                  isBooked && "bg-muted text-muted-foreground/40 cursor-not-allowed",
                                  !isBooked && !isSelected && "border-2 border-primary/40 text-primary/70 hover:border-primary hover:bg-primary/10",
                                  isSelected && "bg-primary text-primary-foreground shadow-sm scale-105"
                                )}
                              >
                                {isBooked ? "×" : letter}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-4 rounded border-2 border-primary/40" /> Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-4 rounded bg-primary" /> Selected
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-4 rounded bg-muted" /> Booked
                </span>
                <span className="flex items-center gap-1.5 text-amber-600">
                  <Crown className="w-3 h-3" /> ₹{SEAT_PRICE} / seat
                </span>
              </div>
            </div>

            {/* Seat selection summary */}
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-2">Selected seats</p>
                {selectedSeats.length === 0 ? (
                  <p className="text-sm text-muted-foreground/70">No seats selected</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSeats.map((s) => (
                      <Badge key={s} className="bg-primary text-primary-foreground">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base fare ({paxCount} pax)</span>
                  <span>{formatFullINR(baseFare)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seat charges ({selectedSeats.length})</span>
                  <span>{formatFullINR(seatCharges)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxes & fees</span>
                  <span>{formatFullINR(taxes)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span className="text-primary">{formatFullINR(totalFare)}</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={continueToReview}
                disabled={selectedSeats.length === 0}
              >
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Seat selection is optional. You can skip and continue.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => { setSeatDialog(false); setReviewDialog(true); }}
              >
                Skip & continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* REVIEW & PAYMENT DIALOG */}
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review your booking</DialogTitle>
            <DialogDescription>
              {selectedFlight?.airline} · {selectedFlight?.flightNumber} ·{" "}
              {selectedFlight?.originCity} → {selectedFlight?.destinationCity}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px] gap-4">
            {/* Forms */}
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" /> Traveller details
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label htmlFor="tv-name" className="text-xs">Full name (adult 1)</Label>
                    <Input
                      id="tv-name"
                      value={travellerName}
                      onChange={(e) => setTravellerName(e.target.value)}
                      placeholder="e.g. Karthik Venkat"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Age</Label>
                    <Input type="number" defaultValue={28} min={1} max={120} />
                  </div>
                  <div>
                    <Label className="text-xs">Gender</Label>
                    <Select defaultValue="male">
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-primary" /> Contact details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="ct-email" className="text-xs">Email</Label>
                    <Input
                      id="ct-email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ct-phone" className="text-xs">Phone</Label>
                    <Input
                      id="ct-phone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+91 90000 00000"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Free cancellation up to 24 hours before departure. Travel insurance available at checkout.
                </p>
              </div>
            </div>

            {/* Fare summary */}
            <div className="space-y-3">
              <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-amber-500/5 p-4">
                <p className="text-sm font-semibold mb-3">Fare summary</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base × {paxCount}</span>
                    <span>{formatFullINR(baseFare)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxes & fees</span>
                    <span>{formatFullINR(taxes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Seat charges</span>
                    <span>{formatFullINR(seatCharges)}</span>
                  </div>
                  {selectedSeats.length > 0 && (
                    <div className="text-[11px] text-muted-foreground pl-1">
                      Seats: {selectedSeats.join(", ")}
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between font-semibold text-base">
                    <span>Total payable</span>
                    <span className="text-primary">{formatFullINR(totalFare)}</span>
                  </div>
                </div>
              </div>
              <Button className="w-full h-11" onClick={openPayment}>
                Proceed to pay <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                By proceeding, you agree to the fare rules and terms of service.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PAYMENT DIALOG (Razorpay-style) */}
      <Dialog open={paymentDialog} onOpenChange={(o) => { if (!paying) setPaymentDialog(o); }}>
        <DialogContent className="sm:max-w-md" showCloseButton={!paying && !paySuccess}>
          {paySuccess ? (
            <div className="py-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 14 }}
                className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mb-4"
              >
                <CheckCircle2 className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <h3 className="text-lg font-semibold">Payment Successful</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your booking is confirmed. A confirmation has been sent to your email.
              </p>
              <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="font-semibold">{formatFullINR(totalFare)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Booking ID</span>
                  <span className="font-mono text-xs">TP{Math.floor(Math.random() * 900000 + 100000)}</span>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Share this ticket with the traveller</p>
                <ShareTicket
                  subject={`Your Flight Ticket — ${selectedFlight?.flightNumber ?? ""}`}
                  text={`Flight Ticket Confirmed\n${selectedFlight?.airline ?? ""} ${selectedFlight?.flightNumber ?? ""}\n${selectedFlight?.originCity ?? ""} → ${selectedFlight?.destinationCity ?? ""}\nDate: ${departDate}\nPassenger: ${travellerName}\nAmount Paid: ${formatFullINR(totalFare)}`}
                />
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" /> Secure Payment
                </DialogTitle>
                <DialogDescription>
                  Powered by Razorpay · 256-bit encrypted
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-lg bg-gradient-to-r from-primary/10 to-amber-500/10 p-4 text-center">
                <p className="text-xs text-muted-foreground">Amount payable</p>
                <p className="text-3xl font-bold tracking-tight text-primary">{formatFullINR(totalFare)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedFlight?.airline} · {selectedFlight?.flightNumber}
                </p>
              </div>

              <Tabs value={payMethod} onValueChange={(v) => setPayMethod(v as PayMethod)}>
                <TabsList className="grid grid-cols-4 w-full h-auto">
                  <TabsTrigger value="card" className="flex-col py-1.5 gap-0.5">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-[10px]">Card</span>
                  </TabsTrigger>
                  <TabsTrigger value="upi" className="flex-col py-1.5 gap-0.5">
                    <Smartphone className="w-4 h-4" />
                    <span className="text-[10px]">UPI</span>
                  </TabsTrigger>
                  <TabsTrigger value="netbanking" className="flex-col py-1.5 gap-0.5">
                    <Building2 className="w-4 h-4" />
                    <span className="text-[10px]">Bank</span>
                  </TabsTrigger>
                  <TabsTrigger value="wallet" className="flex-col py-1.5 gap-0.5">
                    <Wallet className="w-4 h-4" />
                    <span className="text-[10px]">Wallet</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="card" className="space-y-2 mt-3">
                  <div>
                    <Label className="text-xs">Card number</Label>
                    <Input placeholder="4111 1111 1111 1111" maxLength={19} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Expiry</Label>
                      <Input placeholder="MM/YY" maxLength={5} />
                    </div>
                    <div>
                      <Label className="text-xs">CVV</Label>
                      <Input type="password" placeholder="•••" maxLength={3} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="upi" className="space-y-2 mt-3">
                  <div>
                    <Label className="text-xs">UPI ID</Label>
                    <Input placeholder="yourname@upi" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["GPay", "PhonePe", "Paytm", "BHIM"].map((u) => (
                      <Badge key={u} variant="secondary" className="cursor-pointer hover:bg-primary/10">
                        {u}
                      </Badge>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="netbanking" className="space-y-2 mt-3">
                  <Label className="text-xs">Select bank</Label>
                  <Select defaultValue="hdfc">
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hdfc">HDFC Bank</SelectItem>
                      <SelectItem value="icici">ICICI Bank</SelectItem>
                      <SelectItem value="sbi">State Bank of India</SelectItem>
                      <SelectItem value="axis">Axis Bank</SelectItem>
                      <SelectItem value="kotak">Kotak Mahindra Bank</SelectItem>
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="wallet" className="space-y-2 mt-3">
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agency wallet balance</span>
                      <span className="font-semibold">{formatFullINR(walletBalance)}</span>
                    </div>
                  </div>
                  {totalFare > walletBalance && (
                    <p className="text-[11px] text-rose-600">Insufficient balance for this booking.</p>
                  )}
                </TabsContent>
              </Tabs>

              <Button
                className="w-full h-11 text-base"
                onClick={processPayment}
                disabled={paying || (payMethod === "wallet" && totalFare > walletBalance)}
              >
                {paying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    <LockIcon /> Pay {formatFullINR(totalFare)}
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Encrypted checkout · PCI-compliant payment
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

/* ============================ Sub-components ============================ */

function SearchPanel(props: {
  tripType: string;
  setTripType: (v: "oneway" | "round" | "multi") => void;
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  swapCities: () => void;
  departDate: string; setDepartDate: (v: string) => void;
  returnDate: string; setReturnDate: (v: string) => void;
  adults: number; setAdults: (v: number) => void;
  childrenCount: number; setChildrenCount: (v: number) => void;
  infants: number; setInfants: (v: number) => void;
  cabin: string; setCabin: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const travelerCount = props.adults + props.childrenCount;
  const paxLabel = `${travelerCount} traveler${travelerCount === 1 ? "" : "s"}`;
  const isRound = props.tripType === "round";

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-border/70 bg-gradient-to-br from-primary/12 via-card to-brand-teal/10 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-16 size-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-14 bottom-0 size-48 rounded-full bg-brand-teal/20 blur-3xl" />
      <div className="relative p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Flights</p>
            <h1 className="mt-1 text-2xl sm:text-[1.7rem] font-bold tracking-tight">Search & book flights</h1>
            <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
              Domestic and international fares, compared in seconds.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-1.5 rounded-full bg-background/80 border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Instant ticketing
          </div>
        </div>

        <div
          className="flex w-full max-w-lg p-1 rounded-full bg-background/75 border border-border/70 backdrop-blur-sm"
          role="tablist"
          aria-label="Trip type"
        >
          {[
            { id: "oneway", label: "One way" },
            { id: "round", label: "Round trip" },
            { id: "multi", label: "Multi city" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={props.tripType === t.id}
              onClick={() => props.setTripType(t.id as "oneway" | "round" | "multi")}
              className={cn(
                "flex-1 px-2 sm:px-3 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors min-h-[40px] touch-manipulation",
                props.tripType === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-background/95 border border-border/80 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] overflow-hidden">
          <div className="relative grid grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_auto_minmax(0,1.15fr)_0.9fr_0.9fr_1.05fr_auto] lg:items-stretch gap-2 lg:gap-0 p-2 lg:p-0">
            <div className="col-span-2 lg:col-auto min-w-0">
            <AirportField
              icon={PlaneTakeoff}
              label="From"
              value={props.from}
              onSelect={props.setFrom}
              excludeCode={props.to}
              embedded
            />
            </div>

            <div className="lg:hidden absolute left-1/2 top-[5.15rem] z-10 -translate-x-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={props.swapCities}
                className="size-10 rounded-full border border-border bg-background text-muted-foreground hover:text-primary shadow-md flex items-center justify-center"
                aria-label="Swap origin and destination"
              >
                <ArrowLeftRight className="w-4 h-4 rotate-90" />
              </button>
            </div>
            <div className="hidden lg:flex items-center justify-center border-x border-border">
              <button
                type="button"
                onClick={props.swapCities}
                className="size-10 rounded-full border border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/50 shadow-sm flex items-center justify-center"
                aria-label="Swap origin and destination"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            <div className="col-span-2 lg:col-auto min-w-0">
            <AirportField
              icon={PlaneLanding}
              label="To"
              value={props.to}
              onSelect={props.setTo}
              excludeCode={props.from}
              embedded
            />
            </div>

            <DateField
              label="Departure"
              value={props.departDate}
              min={today}
              onChange={props.setDepartDate}
            />

            <DateField
              label="Return"
              value={props.returnDate}
              min={props.departDate || today}
              onChange={props.setReturnDate}
              disabled={!isRound}
              hint={!isRound ? "Round trip" : undefined}
            />

            <div className="col-span-2 lg:col-auto">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left px-3.5 py-3 min-h-[78px] rounded-xl lg:rounded-none border border-border lg:border-0 hover:bg-muted/40 transition-colors touch-manipulation"
                >
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 pointer-events-none mb-1">
                    <Users className="w-3.5 h-3.5" /> Travelers
                  </span>
                  <p className="text-sm font-semibold leading-tight">{paxLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{props.cabin}</p>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(20rem,calc(100vw-2rem))]" align="start">
                <PaxStepper
                  label="Adults" sub="12+ years"
                  value={props.adults} onChange={props.setAdults} min={1} max={9}
                />
                <Separator className="my-2" />
                <PaxStepper
                  label="Children" sub="2–12 years"
                  value={props.childrenCount} onChange={props.setChildrenCount} min={0} max={9}
                />
                <Separator className="my-2" />
                <PaxStepper
                  label="Infants" sub="Under 2 years"
                  value={props.infants} onChange={props.setInfants} min={0} max={4}
                />
                <Separator className="my-2" />
                <div>
                  <p className="text-sm font-medium mb-2">Cabin class</p>
                  <RadioGroup
                    value={props.cabin}
                    onValueChange={props.setCabin}
                    className="grid grid-cols-2 gap-1.5"
                  >
                    {CABIN_CLASSES.map((c) => (
                      <label key={c} className="flex items-center gap-2 cursor-pointer rounded-md border p-1.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                        <RadioGroupItem value={c} id={`c-${c}`} />
                        <span className="text-sm">{c}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </PopoverContent>
            </Popover>
            </div>

            <Button
              onClick={props.onSearch}
              disabled={props.loading}
              className="col-span-2 lg:col-auto h-12 lg:h-auto lg:min-h-[78px] rounded-xl lg:rounded-none lg:rounded-r-2xl px-6 font-semibold gap-2 text-[15px] touch-manipulation"
            >
              {props.loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {props.loading ? "Searching…" : "Search"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DateField({
  label, value, min, onChange, disabled, hint,
}: {
  label: string;
  value: string;
  min: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex flex-col justify-center px-3.5 py-3 min-h-[78px] rounded-xl lg:rounded-none border border-border lg:border-0 lg:border-l cursor-pointer hover:bg-muted/40 transition-opacity",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-1">
        <Calendar className="w-3.5 h-3.5" /> {label}
      </span>
      <span className="text-sm font-semibold">{formatPrettyDate(value)}</span>
      {hint && <span className="text-[11px] text-muted-foreground mt-0.5">{hint}</span>}
      <input
        type="date"
        value={value}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
        aria-label={label}
      />
    </label>
  );
}

function AirportField({ icon: Icon, label, value, onSelect, excludeCode, embedded }: {
  icon: React.ElementType;
  label: string;
  value: string;
  onSelect: (code: string) => void;
  excludeCode?: string;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = airportByCode(value);
  const results = useMemo(() => searchAirports(query, excludeCode), [query, excludeCode]);

  function pick(code: string) {
    onSelect(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActiveIndex(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full h-full text-left p-3.5 min-h-[78px] touch-manipulation transition-colors",
            embedded
              ? "rounded-xl lg:rounded-none border border-border lg:border-0 hover:bg-muted/40"
              : "rounded-xl border border-border bg-background hover:border-primary/40"
          )}
        >
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 pointer-events-none mb-1">
            <Icon className="w-3.5 h-3.5" /> {label}
          </span>
          <p className="text-sm font-semibold leading-tight">
            {selected?.city ?? value}
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">{value}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {selected?.name ?? "Select airport"}
          </p>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[activeIndex]) pick(results[activeIndex].code);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="City, airport or code (e.g. Goa, DEL)"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto scroll-thin py-1">
          {!query && (
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Popular airports
            </p>
          )}
          {results.length === 0 && (
            <p className="px-3 py-6 text-sm text-center text-muted-foreground">No airports match &quot;{query}&quot;</p>
          )}
          {results.map((a, idx) => (
            <button
              key={a.code}
              type="button"
              onClick={() => pick(a.code)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                idx === activeIndex ? "bg-primary/10" : "hover:bg-muted/60"
              )}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {a.city} <span className="text-muted-foreground font-normal">· {a.name}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{a.country}</p>
              </div>
              <span className="text-xs font-bold text-primary shrink-0">{a.code}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PaxStepper({ label, sub, value, onChange, min, max }: {
  label: string; sub: string; value: number;
  onChange: (v: number) => void; min: number; max: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="size-8 rounded-full border border-primary/40 text-primary flex items-center justify-center hover:bg-primary/5 disabled:opacity-30"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-6 text-center font-semibold text-sm">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="size-8 rounded-full border border-primary/40 text-primary flex items-center justify-center hover:bg-primary/5 disabled:opacity-30"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (route: { from: string; to: string }) => void }) {
  const tiles = [
    { from: "BOM", to: "DEL", title: "Mumbai → Delhi", fare: "from ₹4,200", tone: "from-sky-500 to-blue-700" },
    { from: "DEL", to: "GOI", title: "Delhi → Goa", fare: "from ₹5,100", tone: "from-teal-500 to-emerald-700" },
    { from: "DEL", to: "SIN", title: "Delhi → Singapore", fare: "from ₹14,800", tone: "from-indigo-500 to-violet-700" },
    { from: "HYD", to: "DXB", title: "Hyderabad → Dubai", fare: "from ₹16,200", tone: "from-amber-500 to-orange-700" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Where would you like to fly?</h2>
          <p className="text-sm text-muted-foreground">Tap a route to search, or enter cities above.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={() => onPick({ from: t.from, to: t.to })}
            className={cn(
              "relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left text-white min-h-[124px] shadow-sm hover:shadow-md hover:scale-[1.01] transition-all touch-manipulation",
              t.tone
            )}
          >
            <div className="absolute inset-0 opacity-25 hero-pattern" />
            <Plane className="relative w-5 h-5 mb-6 opacity-90" />
            <p className="relative text-sm font-semibold leading-snug">{t.title}</p>
            <p className="relative text-xs text-white/80 mt-1">{t.fare}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Tag, title: "Best fares", desc: "Compare airlines instantly" },
          { icon: ShieldCheck, title: "Secure booking", desc: "Encrypted checkout" },
          { icon: CheckCircle2, title: "Instant tickets", desc: "Confirmed in seconds" },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <f.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortControl({ sortBy, setSortBy }: { sortBy: SortKey; setSortBy: (s: SortKey) => void }) {
  return (
    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
      <SelectTrigger size="sm" className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cheapest">Cheapest first</SelectItem>
        <SelectItem value="fastest">Fastest first</SelectItem>
        <SelectItem value="earliest">Earliest first</SelectItem>
      </SelectContent>
    </Select>
  );
}

function FilterPanel(props: {
  priceRange: [number, number];
  setPriceRange: (v: [number, number]) => void;
  minPrice: number;
  maxPrice: number;
  stopFilter: "all" | "nonstop" | "one";
  setStopFilter: (v: "all" | "nonstop" | "one") => void;
  uniqueAirlines: [string, string][];
  airlineFilter: string[];
  setAirlineFilter: (v: string[]) => void;
  timeFilter: string[];
  setTimeFilter: (v: string[]) => void;
}) {
  return (
    <Card className="sticky top-4">
      <CardContent className="p-4 space-y-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-primary" /> Filters
          </p>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => {
              props.setStopFilter("all");
              props.setAirlineFilter([]);
              props.setTimeFilter([]);
              props.setPriceRange([props.minPrice, props.maxPrice]);
            }}
          >
            Reset all
          </button>
        </div>

        <Separator />

        {/* Stops */}
        <div>
          <p className="text-xs font-semibold mb-2">Stops</p>
          <RadioGroup
            value={props.stopFilter}
            onValueChange={(v) => props.setStopFilter(v as "all" | "nonstop" | "one")}
          >
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="all" id="st-all" /> Any
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="nonstop" id="st-non" /> Non-stop only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="one" id="st-one" /> 1 stop
            </label>
          </RadioGroup>
        </div>

        <Separator />

        {/* Price */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">Price range</p>
            <p className="text-xs text-muted-foreground">
              {formatFullINR(props.priceRange[0])} – {formatFullINR(props.priceRange[1])}
            </p>
          </div>
          <Slider
            min={props.minPrice}
            max={props.maxPrice}
            step={500}
            value={props.priceRange}
            onValueChange={(v) => props.setPriceRange([v[0], v[1]])}
            className="mt-3"
          />
        </div>

        <Separator />

        {/* Departure time */}
        <div>
          <p className="text-xs font-semibold mb-2">Departure time</p>
          <div className="space-y-1.5">
            {TIME_BANDS.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={props.timeFilter.includes(b.id)}
                  onCheckedChange={(c) => {
                    if (c) props.setTimeFilter([...props.timeFilter, b.id]);
                    else props.setTimeFilter(props.timeFilter.filter((t) => t !== b.id));
                  }}
                />
                {b.label}
              </label>
            ))}
          </div>
        </div>

        <Separator />

        {/* Airlines */}
        <div>
          <p className="text-xs font-semibold mb-2">Airlines</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-thin">
            {props.uniqueAirlines.map(([code, name]) => (
              <label key={code} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={props.airlineFilter.includes(code)}
                  onCheckedChange={(c) => {
                    if (c) props.setAirlineFilter([...props.airlineFilter, code]);
                    else props.setAirlineFilter(props.airlineFilter.filter((a) => a !== code));
                  }}
                />
                <span className={cn("size-5 rounded-full bg-gradient-to-br text-white text-[8px] font-bold flex items-center justify-center", airlineGradient(code))}>
                  {code}
                </span>
                {name}
              </label>
            ))}
            {props.uniqueAirlines.length === 0 && (
              <p className="text-xs text-muted-foreground">Run a search first</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FlightCard({ flight, onSelect }: { flight: Flight; onSelect: () => void }) {
  const lowSeats = flight.seatsLeft < 8;
  return (
    <Card className="overflow-hidden hover:shadow-md hover:border-primary/30 transition-all group rounded-2xl border-border/80">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto]">
          <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 min-w-[160px]">
              <div className={cn(
                "size-11 rounded-full bg-gradient-to-br text-white text-xs font-bold flex items-center justify-center shadow-sm",
                airlineGradient(flight.airlineCode)
              )}>
                {flight.airlineCode}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{flight.airline}</p>
                <p className="text-xs text-muted-foreground">{flight.flightNumber}</p>
                <p className="text-[11px] text-muted-foreground/80">{flight.aircraft}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-1 justify-between sm:justify-around">
              {/* Departure */}
              <div className="text-center sm:text-left">
                <p className="text-lg font-bold tracking-tight">{flight.departTime}</p>
                <p className="text-sm font-medium text-foreground">{flight.origin}</p>
                <p className="text-[11px] text-muted-foreground">{flight.originCity}</p>
              </div>

              {/* Duration line */}
              <div className="flex-1 max-w-[180px] flex flex-col items-center">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="w-3 h-3" /> {flight.duration}
                </div>
                <div className="relative w-full flex items-center my-1">
                  <span className="size-1.5 rounded-full bg-primary" />
                  <div className="flex-1 h-px bg-border relative">
                    <Plane className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 text-primary fill-primary" />
                  </div>
                  <span className="size-1.5 rounded-full bg-primary" />
                </div>
                <p className="text-[11px] font-medium text-amber-600">
                  {flight.stops === 0 ? "Non-stop" : `${flight.stops} stop`}
                </p>
              </div>

              {/* Arrival */}
              <div className="text-center sm:text-right">
                <p className="text-lg font-bold tracking-tight">{flight.arriveTime}</p>
                <p className="text-sm font-medium text-foreground">{flight.destination}</p>
                <p className="text-[11px] text-muted-foreground">{flight.destinationCity}</p>
              </div>
            </div>
          </div>

          {/* Right: price + select */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 sm:gap-1 lg:min-w-[168px] p-4 max-lg:border-t lg:border-l bg-muted/30">
            <div className="text-left sm:text-right">
              <p className="text-[11px] text-muted-foreground">starting from</p>
              <p className="text-2xl font-bold tracking-tight text-primary">
                {formatFullINR(flight.price)}
              </p>
              <p className="text-[11px] text-muted-foreground">per adult · incl. taxes</p>
            </div>
            <div className="flex flex-col items-center sm:items-end gap-1">
              <div className="flex items-center gap-1.5">
                {flight.refundable && (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-0 text-[10px]">
                    Refundable
                  </Badge>
                )}
                <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400 border-0 text-[10px]">
                  {flight.cabin}
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{flight.rating.toFixed(1)}</span>
                {lowSeats && (
                  <span className="ml-1 text-rose-600 font-medium">· {flight.seatsLeft} seats left</span>
                )}
              </div>
            </div>
            <Button onClick={onSelect} className="bg-primary hover:bg-primary/90 w-full sm:w-auto min-h-[44px] rounded-xl touch-manipulation">
              Book <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* small inline LockIcon to avoid cluttering imports */
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
