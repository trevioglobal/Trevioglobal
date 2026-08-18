import type { QuotationPackage } from "@/types";

export type DestinationQuotePlan = {
  id: string;
  label: string;
  form: {
    destination: string;
    country: string;
    isInternational: boolean;
    adults: number;
    children: number;
    infants: number;
    currency: string;
    specialRequests: string;
    termsAndConditions: string;
    paymentTerms: string;
    cancellationPolicy: string;
    refundPolicy: string;
    coverImage?: string;
  };
  packages: QuotationPackage[];
};

const IMG = {
  cover: "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1600&q=80",
  phuket: "https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?auto=format&fit=crop&w=1200&q=80",
  phiPhi: "https://images.unsplash.com/photo-1537956965359-7573183d1f57?auto=format&fit=crop&w=1200&q=80",
  hotelPatong: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80",
  hotelKrabi: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80",
  fantasea: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
  tiger: "https://images.unsplash.com/photo-1561731216-c3a4d99437d5?auto=format&fit=crop&w=1200&q=80",
  elephant: "https://images.unsplash.com/photo-1564760055775-d63b17a55c44?auto=format&fit=crop&w=1200&q=80",
  islands: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
  krabiTown: "https://images.unsplash.com/photo-1528183429752-a97d0bf99b1a?auto=format&fit=crop&w=1200&q=80",
  departure: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80",
};

const THAILAND_INCLUSIONS = [
  "Accommodation with breakfast in standard room category",
  "2 nights stay at Phuket",
  "2 nights stay at Krabi",
  "Breakfast at the hotel",
  "Meals as stated in the itinerary",
  "Sightseeing as stated",
  "NPF ticket for island tours",
  "English speaking local guide and private A/C transfers",
  "SIC transfers for island tours",
  "02 bottles of mineral water per person per day",
];

const THAILAND_EXCLUSIONS = [
  "Airline meals as per airline policy",
  "Early check-in / late check-out",
  "Items of personal nature not stated",
  "Meals and beverages if not stated",
  "Room service in hotel",
];

/** Client-facing Thailand 4N/5D plan matching the Trevio sample quotation structure. Selling prices are per the brochure (≈ ₹76,000 per pax). Cost is internal-only. */
export const THAILAND_4N_PLAN: DestinationQuotePlan = {
  id: "thailand-4n-phuket-krabi",
  label: "Thailand 4N 5D — Phuket + Krabi",
  form: {
    destination: "Phuket & Krabi",
    country: "Thailand",
    isInternational: true,
    adults: 2,
    children: 0,
    infants: 0,
    currency: "INR",
    coverImage: IMG.cover,
    specialRequests: "Twin/double sharing. Quote is subject to availability and not blocked until confirmed.",
    termsAndConditions:
      "Above quote is not blocked or booked. It is strictly subject to availability. Includes GST 18% on our service charges. Quote is on twin/double sharing basis. TCS can be claimed while filing annual returns. Passport must be valid 6 months after return. PAN is required to confirm booking as per RBI guidelines.",
    paymentTerms:
      "1st instalment: 50% to confirm flight tickets. Final instalment: 50% to confirm the land package. Share payment reference via email/WhatsApp to receive receipt and tickets.",
    cancellationPolicy:
      "INR 5,000 is non-refundable. Remaining charges follow hotel, visa, transport and airline policies. Notify in writing before the minimum-notice date. No refund for unused nights or early check-out except as per hotel policy for medical cases.",
    refundPolicy:
      "Refunds (if any) are processed after supplier confirmation, typically within 15 working days. Flight fares are guaranteed only at ticket issuance.",
  },
  packages: [
    {
      name: "Standard",
      isSelected: true,
      sortOrder: 0,
      description: "Thailand 4N & 5D (Krabi 2N & Phuket 2N)",
      hotels: [
        {
          hotelName: "Sunshine Patong or similar",
          starCategory: "3",
          roomType: "Deluxe",
          mealPlan: "Breakfast",
          checkIn: "",
          checkOut: "",
          rooms: 1,
          nights: 2,
          city: "Phuket",
          address: "Patong 34/81-88 Prachanukroh Rd, Pa Tong, Kathu District, Phuket 83150, Thailand",
          rating: "3.8",
          imageUrl: IMG.hotelPatong,
          costPrice: 14000,
          sellingPrice: 18500,
        },
        {
          hotelName: "Aonang Paradise Resort Krabi or similar",
          starCategory: "3",
          roomType: "Superior",
          mealPlan: "Breakfast",
          checkIn: "",
          checkOut: "",
          rooms: 1,
          nights: 2,
          city: "Krabi",
          address: "25/18 Moo 2, Ao Nang, Muang, Krabi 81180, Thailand",
          rating: "3.9",
          imageUrl: IMG.hotelKrabi,
          costPrice: 12500,
          sellingPrice: 16500,
        },
      ],
      flights: [
        {
          airline: "Akasa Air",
          flightNumber: "BLR-HKT",
          from: "BLR",
          to: "HKT",
          date: "",
          depTime: "09:50",
          arrTime: "15:05",
          cabinClass: "Economy",
          remarks: "Baggage: check-in + 7 kg hand baggage. Fares tentative until issued.",
          costPrice: 12500,
          sellingPrice: 16750,
          fare: 16750,
          qty: 2,
        },
        {
          airline: "Akasa Air",
          flightNumber: "HKT-BLR",
          from: "HKT",
          to: "BLR",
          date: "",
          depTime: "17:00",
          arrTime: "19:20",
          cabinClass: "Economy",
          remarks: "Return sector. Combined flight ≈ ₹33,500 per pax (tentative until issued).",
          costPrice: 12500,
          sellingPrice: 16750,
          fare: 16750,
          qty: 2,
        },
      ],
      transfers: [
        {
          transferType: "Private A/C transfers",
          vehicleType: "Van",
          pickup: "Phuket airport / hotel",
          drop: "Hotels & Krabi",
          costPrice: 4500,
          sellingPrice: 6500,
        },
        {
          transferType: "SIC island tour transfers",
          vehicleType: "Coach",
          pickup: "Hotel",
          drop: "Pier / hotel",
          costPrice: 2000,
          sellingPrice: 3000,
        },
      ],
      activities: [
        {
          activityName: "Fantasea Show with Dinner",
          description: "Evening cultural show in Phuket with dinner on arrival day.",
          ticketType: "Show",
          imageUrl: IMG.fantasea,
          costPrice: 2800,
          sellingPrice: 4000,
          adults: 2,
          children: 0,
        },
        {
          activityName: "Phi Phi Island tour with lunch",
          description:
            "Speedboat from Phuket covering Green Island, Loh Samah Bay and Pileh Lagoon, with snorkeling and Thai buffet lunch. NPF ticket included.",
          ticketType: "Tour",
          imageUrl: IMG.phiPhi,
          costPrice: 5500,
          sellingPrice: 8000,
          adults: 2,
          children: 0,
        },
        {
          activityName: "Tiger Kingdom — Medium tiger",
          description:
            "Interactive wildlife park in Kathu. Photo experience with hand-raised tigers under trainer supervision. Ticket by cat size.",
          ticketType: "Attraction",
          imageUrl: IMG.tiger,
          costPrice: 3500,
          sellingPrice: 5000,
          adults: 2,
          children: 0,
        },
        {
          activityName: "Elephant Sanctuary (feed)",
          description:
            "Ethical hillside sanctuary. Observation and respectful feeding without forced bathing. Small quiet groups.",
          ticketType: "Attraction",
          imageUrl: IMG.elephant,
          costPrice: 3500,
          sellingPrice: 5000,
          adults: 2,
          children: 0,
        },
        {
          activityName: "4 Island long-tail cruise",
          description:
            "Krabi four islands: Poda, Chicken Island and snorkeling in turquoise water. Local lunch (SIC). NPF ticket included.",
          ticketType: "Cruise",
          imageUrl: IMG.islands,
          costPrice: 4200,
          sellingPrice: 6000,
          adults: 2,
          children: 0,
        },
        {
          activityName: "Krabi City Tour",
          description:
            "Temples, river ecosystem and local markets — a slower cultural day en route to Phuket departure.",
          ticketType: "Local Tour",
          imageUrl: IMG.krabiTown,
          costPrice: 1800,
          sellingPrice: 2800,
          adults: 2,
          children: 0,
        },
      ],
      meals: [
        {
          mealType: "Dinner",
          restaurant: "As per itinerary coupons",
          cuisine: "Thai",
          costPrice: 2400,
          sellingPrice: 3600,
          adults: 2,
          children: 0,
          adultRate: 1800,
          childRate: 0,
        },
      ],
      itinerary: [
        {
          day: 1,
          title: "Day 1: Arrival in Phuket & Fantasea Show with Dinner",
          city: "Phuket",
          mealPlan: "Dinner",
          coverImage: IMG.phuket,
          gallery: [IMG.hotelPatong, IMG.fantasea],
          items: [
            { activityName: "Arrival in Phuket", description: "Airport meet & transfer" },
            { activityName: "Hotel check-in", description: "Sunshine Patong or similar" },
            { activityName: "Fantasea Show with Dinner", description: "Evening show" },
          ],
        },
        {
          day: 2,
          title: "Day 2: Phi Phi Paradise",
          city: "Phuket",
          mealPlan: "Breakfast, Lunch & Dinner",
          coverImage: IMG.phiPhi,
          gallery: [IMG.islands, IMG.cover],
          items: [
            { activityName: "Breakfast & checkout at the hotel", description: "" },
            { activityName: "Phi Phi Island tour with lunch", description: "NPF ticket included" },
            { activityName: "Dinner coupon", description: "" },
          ],
        },
        {
          day: 3,
          title: "Day 3: Phuket wildlife wonders",
          city: "Phuket → Krabi",
          mealPlan: "Breakfast, Lunch & Dinner",
          coverImage: IMG.elephant,
          gallery: [IMG.tiger, IMG.hotelKrabi],
          items: [
            { activityName: "Breakfast in the hotel", description: "" },
            { activityName: "Tiger Kingdom with Medium Tiger", description: "" },
            { activityName: "Lunch coupon", description: "" },
            { activityName: "Elephant Sanctuary Phuket (feed)", description: "" },
            { activityName: "Transfers to Krabi", description: "" },
            { activityName: "Dinner coupon", description: "" },
          ],
        },
        {
          day: 4,
          title: "Day 4: The iconic 4-island long-tail cruise",
          city: "Krabi",
          mealPlan: "Breakfast, Lunch & Dinner",
          coverImage: IMG.islands,
          gallery: [IMG.cover, IMG.phiPhi],
          items: [
            { activityName: "Breakfast in the hotel", description: "" },
            { activityName: "4 Island tour by long-tail boat including local lunch (SIC)", description: "NPF ticket included" },
            { activityName: "Dinner", description: "" },
          ],
        },
        {
          day: 5,
          title: "Day 5: Until next time",
          city: "Krabi → Phuket → Bangalore",
          mealPlan: "Breakfast",
          coverImage: IMG.departure,
          gallery: [IMG.krabiTown],
          items: [
            { activityName: "Breakfast & checkout from the hotel", description: "" },
            { activityName: "Enroute Krabi City Tour to Phuket", description: "" },
            { activityName: "Departure to Bangalore", description: "" },
          ],
        },
      ],
      visa: { enabled: true, visaType: "Tourist", entryType: "Single Entry", sellingPrice: 0, costPrice: 0, remarks: "Passenger is responsible for a valid entry/transit visa. Passport validity 6 months after return." },
      insurance: { enabled: false, provider: "", planName: "", sellingPrice: 0, costPrice: 0 },
      addOns: [],
      inclusions: THAILAND_INCLUSIONS,
      exclusions: THAILAND_EXCLUSIONS,
    },
  ],
};

export const DESTINATION_QUOTE_PLANS: DestinationQuotePlan[] = [THAILAND_4N_PLAN];

export function getDestinationQuotePlan(id: string) {
  return DESTINATION_QUOTE_PLANS.find((p) => p.id === id) || null;
}
