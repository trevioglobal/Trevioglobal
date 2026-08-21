"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hotel as HotelIcon, Search, Calendar, Users, ChevronRight, ChevronDown,
  Star, MapPin, Filter, Loader2, CreditCard, Smartphone,
  Building2, Wallet, ShieldCheck, Plus, Minus, ArrowRight,
  CheckCircle2, RefreshCw, Map as MapIcon, List, Bed, Coffee,
  Check, Wifi, Waves, Dumbbell, Sparkle, Heart, Crown,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatFullINR, formatPrettyDate, PageShell } from "@/components/shared/ui-helpers";
import { CitySearchField, type CityOption } from "@/components/shared/city-search-field";
import { api } from "@/lib/api";
import { mapApiHotel } from "@/lib/api-mappers";
import { useDemoDataStore } from "@/store/demo-data-store";
import { payWithRazorpay } from "@/lib/razorpay";
import { ShareTicket } from "@/components/shared/share-ticket";
import type { Hotel, RoomType } from "@/types";

/* ----------------------------- Constants ----------------------------- */

const HOTEL_DESTINATIONS: CityOption[] = [
  { value: "Mumbai", label: "Mumbai", sublabel: "Maharashtra, India" },
  { value: "New Delhi", label: "New Delhi", sublabel: "Delhi, India" },
  { value: "Bangalore", label: "Bangalore", sublabel: "Karnataka, India" },
  { value: "Chennai", label: "Chennai", sublabel: "Tamil Nadu, India" },
  { value: "Hyderabad", label: "Hyderabad", sublabel: "Telangana, India" },
  { value: "Kolkata", label: "Kolkata", sublabel: "West Bengal, India" },
  { value: "Goa", label: "Goa", sublabel: "India" },
  { value: "Kochi", label: "Kochi", sublabel: "Kerala, India" },
  { value: "Pune", label: "Pune", sublabel: "Maharashtra, India" },
  { value: "Jaipur", label: "Jaipur", sublabel: "Rajasthan, India" },
  { value: "Udaipur", label: "Udaipur", sublabel: "Rajasthan, India" },
  { value: "Agra", label: "Agra", sublabel: "Uttar Pradesh, India" },
  { value: "Shimla", label: "Shimla", sublabel: "Himachal Pradesh, India" },
  { value: "Manali", label: "Manali", sublabel: "Himachal Pradesh, India" },
  { value: "Rishikesh", label: "Rishikesh", sublabel: "Uttarakhand, India" },
  { value: "Varanasi", label: "Varanasi", sublabel: "Uttar Pradesh, India" },
  { value: "Amritsar", label: "Amritsar", sublabel: "Punjab, India" },
  { value: "Darjeeling", label: "Darjeeling", sublabel: "West Bengal, India" },
  { value: "Ooty", label: "Ooty", sublabel: "Tamil Nadu, India" },
  { value: "Munnar", label: "Munnar", sublabel: "Kerala, India" },
  { value: "Dubai", label: "Dubai", sublabel: "United Arab Emirates" },
  { value: "Abu Dhabi", label: "Abu Dhabi", sublabel: "United Arab Emirates" },
  { value: "Singapore", label: "Singapore", sublabel: "Singapore" },
  { value: "Bangkok", label: "Bangkok", sublabel: "Thailand" },
  { value: "Phuket", label: "Phuket", sublabel: "Thailand" },
  { value: "Kuala Lumpur", label: "Kuala Lumpur", sublabel: "Malaysia" },
  { value: "Bali", label: "Bali", sublabel: "Indonesia" },
  { value: "London", label: "London", sublabel: "United Kingdom" },
  { value: "Paris", label: "Paris", sublabel: "France" },
  { value: "New York", label: "New York", sublabel: "USA" },
  { value: "Maldives", label: "Maldives", sublabel: "Maldives" },
];

const QUICK_DESTINATIONS = [
  { city: "Goa", blurb: "Beaches & resorts", tone: "from-teal-500 to-cyan-700" },
  { city: "Dubai", blurb: "Luxury stays", tone: "from-amber-500 to-orange-700" },
  { city: "Mumbai", blurb: "City & business", tone: "from-sky-500 to-blue-700" },
  { city: "Bangkok", blurb: "Food & nightlife", tone: "from-rose-500 to-fuchsia-700" },
  { city: "Singapore", blurb: "Family hotels", tone: "from-indigo-500 to-violet-700" },
  { city: "New Delhi", blurb: "Heritage stays", tone: "from-emerald-500 to-green-800" },
];

const STAR_OPTIONS = [5, 4, 3];

const ALL_AMENITIES = [
  "Free WiFi", "Swimming Pool", "Spa", "Gym", "Restaurant",
  "Bar", "Airport Shuttle", "Business Center",
];

const AMENITY_ICONS: Record<string, React.ElementType> = {
  "Free WiFi": Wifi,
  "Swimming Pool": Waves,
  "Gym": Dumbbell,
  "Spa": Sparkle,
  "Restaurant": Coffee,
  "Bar": Coffee,
  "Airport Shuttle": ArrowRight,
  "Business Center": Building2,
};

const HOTEL_GRADIENTS = [
  "from-brand-blue to-brand-teal",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
  "from-cyan-400 to-teal-500",
  "from-orange-400 to-red-500",
];

function hotelGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return HOTEL_GRADIENTS[Math.abs(h) % HOTEL_GRADIENTS.length];
}

type Step = "search" | "results";
type SortKey = "recommended" | "price-low" | "price-high" | "rating";
type PayMethod = "card" | "upi" | "netbanking" | "wallet";

/* ============================ Main View ============================ */

export function HotelsView() {
  const { toast } = useToast();
  const addBooking = useDemoDataStore((s) => s.addBooking);
  const walletBalance = useDemoDataStore((s) => s.walletBalance);
  const walletTransfer = useDemoDataStore((s) => s.walletTransfer);

  /* Search state */
  const [city, setCity] = useState("Mumbai");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(2);
  const [childrenCount, setChildrenCount] = useState(0);

  /* Results state */
  const [step, setStep] = useState<Step>("search");
  const [results, setResults] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");

  /* Filters */
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 20000]);
  const [starFilter, setStarFilter] = useState<number[]>([]);
  const [amenityFilter, setAmenityFilter] = useState<string[]>([]);
  const [distanceMax, setDistanceMax] = useState(10);
  const [sortBy, setSortBy] = useState<SortKey>("recommended");
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  /* Room selection */
  const [expandedHotel, setExpandedHotel] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomType | null>(null);
  const [guestDialog, setGuestDialog] = useState(false);

  /* Payment */
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [specialRequest, setSpecialRequest] = useState("");

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 1;
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
  }, [checkIn, checkOut]);

  const maxPrice = useMemo(() => Math.max(20000, ...results.map((r) => r.pricePerNight)), [results]);

  const filteredResults = useMemo(() => {
    let r = results.filter((h) => {
      if (h.pricePerNight < priceRange[0] || h.pricePerNight > priceRange[1]) return false;
      if (starFilter.length && !starFilter.includes(h.starRating)) return false;
      if (amenityFilter.length && !amenityFilter.every((a) => h.amenities.includes(a))) return false;
      if (h.distanceFromCenter > distanceMax) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      if (sortBy === "price-low") return a.pricePerNight - b.pricePerNight;
      if (sortBy === "price-high") return b.pricePerNight - a.pricePerNight;
      if (sortBy === "rating") return b.rating - a.rating;
      return b.rating - a.rating;
    });
    return r;
  }, [results, priceRange, starFilter, amenityFilter, distanceMax, sortBy]);

  /* Actions */
  function handleSearch() {
    if (!checkIn || !checkOut) {
      toast({
        title: "Dates required",
        description: "Please select check-in and check-out dates.",
        variant: "destructive",
      });
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      toast({
        title: "Invalid dates",
        description: "Check-out must be after check-in.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await api.searchHotels(city, 8, checkIn, checkOut);
        const r = res.hotels.map(mapApiHotel);
        if (!r.length) {
          toast({
            title: "No hotels found",
            description: res.source === "live"
              ? "Amadeus returned no hotels for this city/dates."
              : "No demo hotels matched.",
            variant: "destructive",
          });
        } else if (res.source === "live") {
          toast({ title: "Live inventory", description: `Showing Amadeus hotel results.` });
        }
        setResults(r);
        const prices = r.map((h) => h.pricePerNight);
        if (prices.length) setPriceRange([Math.min(...prices), Math.max(...prices)]);
      } catch (e) {
        toast({
          title: "Hotel search failed",
          description: e instanceof Error ? e.message : "Check Amadeus API keys in Settings.",
          variant: "destructive",
        });
        setResults([]);
      }
      setStarFilter([]);
      setAmenityFilter([]);
      setDistanceMax(10);
      setStep("results");
      setLoading(false);
    })();
  }

  function pickQuickDestination(d: { city: string }) {
    setCity(d.city);
    if (!checkIn) {
      const today = new Date();
      today.setDate(today.getDate() + 7);
      setCheckIn(today.toISOString().slice(0, 10));
      today.setDate(today.getDate() + 3);
      setCheckOut(today.toISOString().slice(0, 10));
    }
    setTimeout(handleSearch, 50);
  }

  function toggleFavorite(id: string) {
    setFavorites((cur) =>
      cur.includes(id) ? cur.filter((f) => f !== id) : [...cur, id]
    );
  }

  function openRoomSelection(hotel: Hotel) {
    setSelectedHotel(hotel);
    setGuestDialog(true);
  }

  function bookRoom(hotel: Hotel, room: RoomType) {
    setSelectedHotel(hotel);
    setSelectedRoom(room);
    setGuestDialog(false);
    setPaymentDialog(true);
    setPaySuccess(false);
    setPaying(false);
  }

  async function processPayment() {
    if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
      toast({
        title: "Guest details required",
        description: "Please fill in name, email and phone.",
        variant: "destructive",
      });
      return;
    }

    const description = `${selectedHotel?.name ?? "Hotel"} · ${selectedRoom?.name ?? ""}`;
    let paidMethod: "Wallet" | "Razorpay" = "Razorpay";

    if (payMethod === "wallet") {
      if (total > walletBalance) {
        toast({
          title: "Insufficient wallet balance",
          description: `Your wallet has ${formatFullINR(walletBalance)}, but this booking costs ${formatFullINR(total)}.`,
          variant: "destructive",
        });
        return;
      }
      setPaying(true);
      walletTransfer(total, description);
      paidMethod = "Wallet";
    } else {
      setPaying(true);
      const result = await payWithRazorpay({ amount: total, name: "Trevio Global", description, prefillEmail: guestEmail, prefillContact: guestPhone });
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
    if (selectedHotel && selectedRoom) {
      addBooking({
        customerName: guestName,
        service: "Hotel",
        route: `${selectedHotel.name}, ${selectedHotel.city} - ${nights}N`,
        travelDate: checkIn || new Date().toISOString().slice(0, 10),
        amount: total,
        paymentMethod: paidMethod,
      });
    }
    setTimeout(resetAll, 6000);
  }

  function resetAll() {
    setPaymentDialog(false);
    setGuestDialog(false);
    setSelectedHotel(null);
    setSelectedRoom(null);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setSpecialRequest("");
    setPaySuccess(false);
    setPaying(false);
  }

  /* Fare calc */
  const roomRate = selectedRoom?.price ?? 0;
  const subtotal = roomRate * nights * rooms;
  const taxes = Math.round(subtotal * 0.12);
  const total = subtotal + taxes;

  /* ============================ Render ============================ */
  return (
    <PageShell>
      <HotelSearchPanel
        city={city} setCity={setCity}
        checkIn={checkIn} setCheckIn={setCheckIn}
        checkOut={checkOut} setCheckOut={setCheckOut}
        rooms={rooms} setRooms={setRooms}
        adults={adults} setAdults={setAdults}
        childrenCount={childrenCount} setChildrenCount={setChildrenCount}
        onSearch={handleSearch}
        loading={loading}
      />

      {/* Quick destination chips on search screen */}
      {step === "search" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground shrink-0">
            Trending
          </span>
          {QUICK_DESTINATIONS.map((d) => (
            <button
              key={d.city}
              type="button"
              onClick={() => pickQuickDestination(d)}
              className="px-3.5 py-2 rounded-full text-xs font-medium border border-border/80 bg-card shadow-xs hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all whitespace-nowrap min-h-[40px] touch-manipulation"
            >
              {d.city}
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
            <HotelEmptyState onPick={pickQuickDestination} />
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
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-lg">{city}</span>
                  </div>
                  <Separator orientation="vertical" className="h-6 hidden sm:block" />
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" /> {formatPrettyDate(checkIn)} → {formatPrettyDate(checkOut)}
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {rooms} Room{rooms > 1 ? "s" : ""} · {adults + childrenCount} Guest{(adults + childrenCount) > 1 ? "s" : ""}
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    {nights} Night{nights > 1 ? "s" : ""}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" onClick={() => setStep("search")} className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Modify
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
              {/* Filter sidebar (desktop) */}
              <aside className="hidden lg:block">
                <HotelFilterPanel
                  priceRange={priceRange}
                  setPriceRange={setPriceRange}
                  maxPrice={maxPrice}
                  starFilter={starFilter}
                  setStarFilter={setStarFilter}
                  amenityFilter={amenityFilter}
                  setAmenityFilter={setAmenityFilter}
                  distanceMax={distanceMax}
                  setDistanceMax={setDistanceMax}
                />
              </aside>

              {/* Results list / map */}
              <div>
                <div className="hidden lg:flex items-center justify-between mb-3">
                  <p className="text-sm text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{filteredResults.length}</span> of{" "}
                    {results.length} hotels in {city}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border overflow-hidden">
                      <button
                        onClick={() => setView("list")}
                        className={cn("p-1.5 px-2 flex items-center gap-1 text-xs", view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                      >
                        <List className="w-3.5 h-3.5" /> List
                      </button>
                      <button
                        onClick={() => setView("map")}
                        className={cn("p-1.5 px-2 flex items-center gap-1 text-xs", view === "map" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                      >
                        <MapIcon className="w-3.5 h-3.5" /> Map
                      </button>
                    </div>
                    <HotelSortControl sortBy={sortBy} setSortBy={setSortBy} />
                  </div>
                </div>

                {/* Mobile filter + sort */}
                <div className="lg:hidden flex items-center justify-between mb-3">
                  <Button variant="outline" size="sm" onClick={() => setShowFiltersMobile(true)} className="gap-1.5 min-h-[44px] touch-manipulation">
                    <Filter className="w-4 h-4" /> Filters
                  </Button>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border overflow-hidden">
                      <button onClick={() => setView("list")} className={cn("p-1.5 px-2", view === "list" ? "bg-primary text-primary-foreground" : "")}>
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setView("map")} className={cn("p-1.5 px-2", view === "map" ? "bg-primary text-primary-foreground" : "")}>
                        <MapIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <HotelSortControl sortBy={sortBy} setSortBy={setSortBy} />
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <div className="h-32 rounded-lg bg-muted animate-pulse" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : filteredResults.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <HotelIcon className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="font-medium">No hotels match your filters</p>
                      <p className="text-sm text-muted-foreground mt-1">Try widening the price range or removing filters.</p>
                    </CardContent>
                  </Card>
                ) : view === "map" ? (
                  <MapView hotels={filteredResults} onSelectHotel={openRoomSelection} />
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence>
                      {filteredResults.map((hotel, idx) => (
                        <motion.div
                          key={hotel.id}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                        >
                          <HotelCard
                            hotel={hotel}
                            nights={nights}
                            isFavorite={favorites.includes(hotel.id)}
                            onFavToggle={() => toggleFavorite(hotel.id)}
                            expanded={expandedHotel === hotel.id}
                            onToggleExpand={() =>
                              setExpandedHotel(expandedHotel === hotel.id ? null : hotel.id)
                            }
                            onViewRooms={() => openRoomSelection(hotel)}
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

      {/* Mobile filter dialog */}
      <Dialog open={showFiltersMobile} onOpenChange={setShowFiltersMobile}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto scroll-thin">
            <HotelFilterPanel
              priceRange={priceRange}
              setPriceRange={setPriceRange}
              maxPrice={maxPrice}
              starFilter={starFilter}
              setStarFilter={setStarFilter}
              amenityFilter={amenityFilter}
              setAmenityFilter={setAmenityFilter}
              distanceMax={distanceMax}
              setDistanceMax={setDistanceMax}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowFiltersMobile(false)} className="w-full">
              Show {filteredResults.length} hotels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ROOM SELECTION DIALOG */}
      <Dialog open={guestDialog} onOpenChange={setGuestDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bed className="w-5 h-5 text-primary" /> Choose your room
            </DialogTitle>
            <DialogDescription>
              {selectedHotel?.name} · {selectedHotel?.area}, {selectedHotel?.city} · {nights} night{nights > 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto scroll-thin space-y-3 -mx-1 px-1">
            {selectedHotel?.rooms.map((room) => {
              const lowRooms = room.roomsLeft <= 2;
              return (
                <Card key={room.id} className="overflow-hidden border-border/70 hover:border-primary/40 transition-colors">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{room.name}</p>
                          {lowRooms && (
                            <Badge variant="secondary" className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-0 text-[10px]">
                              Only {room.roomsLeft} left
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{room.description}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Badge variant="secondary" className="border-0 bg-muted text-muted-foreground text-[10px] gap-1">
                            <Bed className="w-3 h-3" /> {room.beds}
                          </Badge>
                          <Badge variant="secondary" className="border-0 bg-muted text-muted-foreground text-[10px] gap-1">
                            <Users className="w-3 h-3" /> Max {room.maxGuests}
                          </Badge>
                          {room.includesBreakfast && (
                            <Badge variant="secondary" className="border-0 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 text-[10px] gap-1">
                              <Coffee className="w-3 h-3" /> Breakfast
                            </Badge>
                          )}
                          {room.freeCancellation && (
                            <Badge variant="secondary" className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 text-[10px] gap-1">
                              <Check className="w-3 h-3" /> Free Cancellation
                            </Badge>
                          )}
                          {room.refundable && (
                            <Badge variant="secondary" className="border-0 bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400 text-[10px]">
                              Refundable
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex sm:flex-col items-end sm:items-end justify-between gap-2 sm:min-w-[140px] sm:border-l sm:pl-3">
                        <div className="text-right">
                          <p className="text-[11px] text-muted-foreground">per night</p>
                          <p className="text-xl font-bold text-primary">{formatFullINR(room.price)}</p>
                          <p className="text-[11px] text-muted-foreground">excl. taxes</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => selectedHotel && bookRoom(selectedHotel, room)}
                          className="bg-primary"
                        >
                          Book <ArrowRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* GUEST DETAILS + PAYMENT DIALOG */}
      <Dialog open={paymentDialog} onOpenChange={(o) => { if (!paying) setPaymentDialog(o); }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!paying && !paySuccess}>
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
              <h3 className="text-lg font-semibold">Booking Confirmed!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your hotel is booked. A confirmation has been sent to your email.
              </p>
              <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hotel</span>
                  <span className="font-semibold">{selectedHotel?.name}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Room</span>
                  <span className="font-semibold">{selectedRoom?.name}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="font-semibold">{formatFullINR(total)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Booking ID</span>
                  <span className="font-mono text-xs">HT{Math.floor(Math.random() * 900000 + 100000)}</span>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Share this ticket with the guest</p>
                <ShareTicket
                  subject={`Your Hotel Booking — ${selectedHotel?.name ?? ""}`}
                  text={`Hotel Booking Confirmed\n${selectedHotel?.name ?? ""}, ${selectedHotel?.city ?? ""}\nRoom: ${selectedRoom?.name ?? ""}\nNights: ${nights}\nAmount Paid: ${formatFullINR(total)}`}
                />
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" /> Guest Details & Payment
                </DialogTitle>
                <DialogDescription>
                  {selectedHotel?.name} · {selectedRoom?.name}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
                {/* Forms */}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="g-name" className="text-xs">Primary guest name</Label>
                    <Input
                      id="g-name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="e.g. Karthik Venkat"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="g-email" className="text-xs">Email</Label>
                      <Input
                        id="g-email"
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="g-phone" className="text-xs">Phone</Label>
                      <Input
                        id="g-phone"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder="+91 90000 00000"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="g-req" className="text-xs">Special requests (optional)</Label>
                    <Input
                      id="g-req"
                      value={specialRequest}
                      onChange={(e) => setSpecialRequest(e.target.value)}
                      placeholder="Early check-in, high floor, etc."
                    />
                  </div>

                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Free cancellation up to 48 hours before check-in.
                    </p>
                  </div>
                </div>

                {/* Fare summary */}
                <div className="space-y-2">
                  <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-amber-500/5 p-3">
                    <p className="text-xs font-semibold mb-2">Price summary</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{formatFullINR(roomRate)} × {nights} × {rooms}</span>
                        <span>{formatFullINR(subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxes & fees</span>
                        <span>{formatFullINR(taxes)}</span>
                      </div>
                      <Separator className="my-1" />
                      <div className="flex justify-between font-semibold text-sm">
                        <span>Total</span>
                        <span className="text-primary">{formatFullINR(total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-1" />

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

                <TabsContent value="card" className="space-y-2 mt-2">
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

                <TabsContent value="upi" className="space-y-2 mt-2">
                  <div>
                    <Label className="text-xs">UPI ID</Label>
                    <Input placeholder="yourname@upi" />
                  </div>
                </TabsContent>

                <TabsContent value="netbanking" className="space-y-2 mt-2">
                  <Label className="text-xs">Select bank</Label>
                  <Select defaultValue="hdfc">
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hdfc">HDFC Bank</SelectItem>
                      <SelectItem value="icici">ICICI Bank</SelectItem>
                      <SelectItem value="sbi">State Bank of India</SelectItem>
                      <SelectItem value="axis">Axis Bank</SelectItem>
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="wallet" className="space-y-2 mt-2">
                  <div className="rounded-lg border p-2 text-xs flex justify-between">
                    <span className="text-muted-foreground">Agency wallet balance</span>
                    <span className="font-semibold">{formatFullINR(walletBalance)}</span>
                  </div>
                  {total > walletBalance && (
                    <p className="text-[11px] text-rose-600">Insufficient balance for this booking.</p>
                  )}
                </TabsContent>
              </Tabs>

              <Button
                className="w-full h-11 text-base"
                onClick={processPayment}
                disabled={paying || (payMethod === "wallet" && total > walletBalance)}
              >
                {paying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                  </>
                ) : (
                  <>Pay {formatFullINR(total)}</>
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

function HotelSearchPanel(props: {
  city: string; setCity: (v: string) => void;
  checkIn: string; setCheckIn: (v: string) => void;
  checkOut: string; setCheckOut: (v: string) => void;
  rooms: number; setRooms: (v: number) => void;
  adults: number; setAdults: (v: number) => void;
  childrenCount: number; setChildrenCount: (v: number) => void;
  onSearch: () => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const guestLabel = `${props.rooms} room${props.rooms > 1 ? "s" : ""} · ${props.adults + props.childrenCount} guest${props.adults + props.childrenCount > 1 ? "s" : ""}`;
  const nightCount = (() => {
    if (!props.checkIn || !props.checkOut) return 0;
    const ms = new Date(`${props.checkOut}T12:00:00`).getTime() - new Date(`${props.checkIn}T12:00:00`).getTime();
    return Math.max(0, Math.round(ms / 86400000));
  })();

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-border/70 bg-gradient-to-br from-primary/12 via-card to-brand-teal/10 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-16 size-64 rounded-full bg-brand-teal/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-14 bottom-0 size-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Hotels</p>
            <h1 className="mt-1 text-2xl sm:text-[1.7rem] font-bold tracking-tight">Find your stay</h1>
            <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
              Hotels, resorts and homestays — best available rates.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-1.5 rounded-full bg-background/80 border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Free cancellation
          </div>
        </div>

        <div className="rounded-2xl bg-background/95 border border-border/80 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_0.9fr_0.9fr_1.15fr_auto] lg:items-stretch gap-2 lg:gap-0 p-2 lg:p-0">
            <div className="col-span-2 lg:col-auto min-w-0">
              <CitySearchField
                icon={MapPin}
                label="City / hotel / area"
                placeholder="Search destination..."
                value={props.city}
                options={HOTEL_DESTINATIONS}
                onSelect={props.setCity}
                triggerClassName="rounded-xl lg:rounded-none border lg:border-0 min-h-[78px] hover:bg-muted/40"
              />
            </div>

            <HotelDateField
              label="Check-in"
              value={props.checkIn}
              min={today}
              onChange={props.setCheckIn}
            />
            <HotelDateField
              label="Check-out"
              value={props.checkOut}
              min={props.checkIn || today}
              onChange={props.setCheckOut}
              hint={nightCount > 0 ? `${nightCount} night${nightCount > 1 ? "s" : ""}` : undefined}
            />

            <div className="col-span-2 lg:col-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full text-left px-3.5 py-3 min-h-[78px] rounded-xl lg:rounded-none border border-border lg:border-0 lg:border-l hover:bg-muted/40 transition-colors touch-manipulation"
                  >
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 pointer-events-none mb-1">
                      <Users className="w-3.5 h-3.5" /> Guests
                    </span>
                    <p className="text-sm font-semibold leading-tight">{guestLabel}</p>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(20rem,calc(100vw-2rem))]" align="start">
                  <Stepper
                    label="Rooms" sub="Choose room count"
                    value={props.rooms} onChange={props.setRooms} min={1} max={5}
                  />
                  <Separator className="my-2" />
                  <Stepper
                    label="Adults" sub="12+ years"
                    value={props.adults} onChange={props.setAdults} min={1} max={12}
                  />
                  <Separator className="my-2" />
                  <Stepper
                    label="Children" sub="2–12 years"
                    value={props.childrenCount} onChange={props.setChildrenCount} min={0} max={8}
                  />
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

function HotelDateField({
  label, value, min, onChange, hint,
}: {
  label: string;
  value: string;
  min: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="relative flex flex-col justify-center px-3.5 py-3 min-h-[78px] rounded-xl lg:rounded-none border border-border lg:border-0 lg:border-l cursor-pointer hover:bg-muted/40">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-1">
        <Calendar className="w-3.5 h-3.5" /> {label}
      </span>
      <span className="text-sm font-semibold">{formatPrettyDate(value)}</span>
      {hint && <span className="text-[11px] text-muted-foreground mt-0.5">{hint}</span>}
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label={label}
      />
    </label>
  );
}

function Stepper({ label, sub, value, onChange, min, max }: {
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

function HotelEmptyState({ onPick }: { onPick: (d: { city: string }) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Find your perfect stay</h2>
        <p className="text-sm text-muted-foreground">Pick a destination or search any city above.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {QUICK_DESTINATIONS.map((d) => (
          <button
            key={d.city}
            type="button"
            onClick={() => onPick(d)}
            className={cn(
              "relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left text-white min-h-[120px] shadow-sm hover:shadow-md hover:scale-[1.01] transition-all touch-manipulation",
              d.tone
            )}
          >
            <div className="absolute inset-0 opacity-25 hero-pattern" />
            <HotelIcon className="relative w-5 h-5 mb-6 opacity-90" />
            <p className="relative text-sm font-semibold">{d.city}</p>
            <p className="relative text-xs text-white/80 mt-0.5">{d.blurb}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Crown, title: "Luxury stays", desc: "5★ hotels & resorts" },
          { icon: ShieldCheck, title: "Verified properties", desc: "Quality-checked hotels" },
          { icon: CheckCircle2, title: "Free cancellation", desc: "Flexible booking options" },
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

function HotelSortControl({ sortBy, setSortBy }: { sortBy: SortKey; setSortBy: (s: SortKey) => void }) {
  return (
    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
      <SelectTrigger size="sm" className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="recommended">Recommended</SelectItem>
        <SelectItem value="price-low">Price: Low to High</SelectItem>
        <SelectItem value="price-high">Price: High to Low</SelectItem>
        <SelectItem value="rating">Top Rated</SelectItem>
      </SelectContent>
    </Select>
  );
}

function HotelFilterPanel(props: {
  priceRange: [number, number];
  setPriceRange: (v: [number, number]) => void;
  maxPrice: number;
  starFilter: number[];
  setStarFilter: (v: number[]) => void;
  amenityFilter: string[];
  setAmenityFilter: (v: string[]) => void;
  distanceMax: number;
  setDistanceMax: (v: number) => void;
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
              props.setStarFilter([]);
              props.setAmenityFilter([]);
              props.setDistanceMax(10);
              props.setPriceRange([0, props.maxPrice]);
            }}
          >
            Reset all
          </button>
        </div>

        <Separator />

        {/* Star rating */}
        <div>
          <p className="text-xs font-semibold mb-2">Star rating</p>
          <div className="space-y-1.5">
            {STAR_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={props.starFilter.includes(s)}
                  onCheckedChange={(c) => {
                    if (c) props.setStarFilter([...props.starFilter, s]);
                    else props.setStarFilter(props.starFilter.filter((x) => x !== s));
                  }}
                />
                <span className="flex">
                  {Array.from({ length: s }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ))}
                  <span className="ml-1.5 text-muted-foreground">({s} star)</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <Separator />

        {/* Price */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">Price / night</p>
            <p className="text-xs text-muted-foreground">
              {formatFullINR(props.priceRange[0])} – {formatFullINR(props.priceRange[1])}
            </p>
          </div>
          <Slider
            min={0}
            max={props.maxPrice}
            step={500}
            value={props.priceRange}
            onValueChange={(v) => props.setPriceRange([v[0], v[1]])}
            className="mt-3"
          />
        </div>

        <Separator />

        {/* Distance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">Distance from center</p>
            <p className="text-xs text-muted-foreground">{props.distanceMax} km</p>
          </div>
          <Slider
            min={1}
            max={10}
            step={1}
            value={[props.distanceMax]}
            onValueChange={(v) => props.setDistanceMax(v[0])}
            className="mt-3"
          />
        </div>

        <Separator />

        {/* Amenities */}
        <div>
          <p className="text-xs font-semibold mb-2">Amenities</p>
          <div className="space-y-1.5">
            {ALL_AMENITIES.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={props.amenityFilter.includes(a)}
                  onCheckedChange={(c) => {
                    if (c) props.setAmenityFilter([...props.amenityFilter, a]);
                    else props.setAmenityFilter(props.amenityFilter.filter((x) => x !== a));
                  }}
                />
                {a}
              </label>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HotelCard({ hotel, nights, isFavorite, onFavToggle, expanded, onToggleExpand, onViewRooms }: {
  hotel: Hotel;
  nights: number;
  isFavorite: boolean;
  onFavToggle: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onViewRooms: () => void;
}) {
  const discount = hotel.originalPrice > hotel.pricePerNight
    ? Math.round(((hotel.originalPrice - hotel.pricePerNight) / hotel.originalPrice) * 100)
    : 0;
  const grad = hotelGradient(hotel.id);

  return (
    <Card className="overflow-hidden hover:shadow-md hover:border-primary/30 transition-all rounded-2xl border-border/80">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
          {/* Image placeholder */}
          <div className={cn(
            "relative h-32 sm:h-full min-h-[140px] rounded-xl bg-gradient-to-br flex items-center justify-center overflow-hidden",
            grad
          )}>
            <div className="absolute inset-0 opacity-30 hero-pattern" />
            <HotelIcon className="w-12 h-12 text-white/90" />
            {discount > 0 && (
              <Badge className="absolute top-2 left-2 bg-rose-600 text-white border-0">
                -{discount}%
              </Badge>
            )}
            <button
              onClick={onFavToggle}
              className="absolute top-2 right-2 size-8 rounded-full bg-white/90 flex items-center justify-center hover:scale-110 transition-transform"
            >
              <Heart className={cn("w-4 h-4", isFavorite ? "fill-rose-500 text-rose-500" : "text-rose-400")} />
            </button>
          </div>

          {/* Info */}
          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-semibold text-base leading-tight">{hotel.name}</p>
                  <span className="flex">
                    {Array.from({ length: hotel.starRating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {hotel.area}, {hotel.city} · {hotel.distanceFromCenter} km from center
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="text-center bg-emerald-600 text-white rounded-md px-2 py-1">
                  <p className="text-sm font-bold leading-none">{hotel.rating.toFixed(1)}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold">Excellent</p>
                  <p className="text-[10px] text-muted-foreground">{hotel.reviews} reviews</p>
                </div>
              </div>
            </div>

            {/* Amenities chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {hotel.amenities.slice(0, 4).map((a) => {
                const Icon = AMENITY_ICONS[a] ?? Check;
                return (
                  <Badge key={a} variant="secondary" className="border-0 bg-muted text-muted-foreground text-[10px] gap-1">
                    <Icon className="w-3 h-3" /> {a}
                  </Badge>
                );
              })}
              {hotel.amenities.length > 4 && (
                <Badge variant="secondary" className="border-0 bg-muted text-muted-foreground text-[10px]">
                  +{hotel.amenities.length - 4} more
                </Badge>
              )}
            </div>

            <div className="mt-auto pt-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                {discount > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="line-through">{formatFullINR(hotel.originalPrice)}</span>
                    <span className="ml-1.5 text-rose-600 font-medium">-{discount}%</span>
                  </p>
                )}
                <p className="text-2xl font-bold tracking-tight text-primary">
                  {formatFullINR(hotel.pricePerNight)}
                </p>
                <p className="text-[11px] text-muted-foreground">per night · excl. taxes</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatFullINR(hotel.pricePerNight * nights)} for {nights} night{nights > 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <Button onClick={onViewRooms} className="bg-primary w-full sm:w-auto min-h-[44px] rounded-xl touch-manipulation">
                  View rooms <ChevronRight className="w-4 h-4" />
                </Button>
                <button
                  onClick={onToggleExpand}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                >
                  {expanded ? "Hide" : "Quick view"} amenities
                  <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                </button>
              </div>
            </div>

            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 pt-2 border-t"
              >
                <p className="text-xs font-semibold mb-1.5">All amenities</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {hotel.amenities.map((a) => {
                    const Icon = AMENITY_ICONS[a] ?? Check;
                    return (
                      <span key={a} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="w-3 h-3 text-primary" /> {a}
                      </span>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MapView({ hotels, onSelectHotel }: { hotels: Hotel[]; onSelectHotel: (h: Hotel) => void }) {
  // Stylized "map" with price pins over a gradient background
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="relative h-[480px] bg-gradient-to-br from-emerald-100 via-teal-50 to-amber-100 dark:from-emerald-900/30 dark:via-teal-900/20 dark:to-amber-900/20">
          {/* Stylized map grid lines */}
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "linear-gradient(rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />
          {/* Fake roads */}
          <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
            <path d="M 0,200 Q 200,150 400,250 T 800,180" stroke="currentColor" strokeWidth="3" fill="none" className="text-teal-700" />
            <path d="M 100,0 Q 200,200 350,300 T 500,500" stroke="currentColor" strokeWidth="2" fill="none" className="text-amber-700" />
            <path d="M 0,80 L 800,120" stroke="currentColor" strokeWidth="2" fill="none" className="text-rose-700" />
          </svg>
          {/* "City center" marker */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            <div className="size-3 rounded-full bg-rose-600 ring-4 ring-rose-600/20 pulse-dot" />
            <p className="text-[10px] font-semibold text-rose-700 mt-1 bg-white/80 px-1.5 py-0.5 rounded">City Center</p>
          </div>
          {/* Price pins */}
          {hotels.map((h, idx) => {
            const angle = (idx / hotels.length) * Math.PI * 2;
            const radius = 80 + (idx % 3) * 40;
            const cx = 50 + (Math.cos(angle) * radius) / 5;
            const cy = 50 + (Math.sin(angle) * radius) / 5;
            return (
              <button
                key={h.id}
                onClick={() => onSelectHotel(h)}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: `${cx}%`, top: `${cy}%` }}
              >
                <div className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full shadow-lg hover:bg-primary/90 hover:scale-110 transition-all whitespace-nowrap">
                  {formatFullINR(h.pricePerNight)}
                </div>
                <div className="hidden group-hover:block absolute z-10 left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-48 bg-card border rounded-lg shadow-xl p-2 text-left">
                  <p className="text-xs font-semibold truncate">{h.name}</p>
                  <p className="text-[10px] text-muted-foreground">{h.area}</p>
                  <p className="text-xs font-bold text-primary mt-0.5">{formatFullINR(h.pricePerNight)} / night</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    <span className="text-[10px] font-medium">{h.rating.toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground">· {h.reviews}</span>
                  </div>
                </div>
              </button>
            );
          })}
          <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur rounded-lg border p-2 text-xs flex items-center gap-2">
            <MapIcon className="w-3.5 h-3.5 text-primary" />
            Showing {hotels.length} hotels · click pin to view rooms
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
