/**
 * Seed SightseeingPlace rows under major destinations so quotation itinerary
 * picker auto-fills image, description, best time, famous for, and optional price.
 *
 * Usage: npx tsx scripts/seed-sightseeing-places.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: ["error", "warn"] });

type PlaceSeed = {
  name: string;
  description: string;
  bestTimeToVisit: string;
  famousFor: string;
  imageUrl: string;
  suggestedDuration?: string;
  sellingPrice?: number;
};

const PLACES: Record<string, { country: string; places: PlaceSeed[] }> = {
  Goa: {
    country: "India",
    places: [
      {
        name: "Calangute Beach",
        description: "Goa's largest beach — golden sand, water sports, shacks and sunset walks. Ideal first-day soft landing.",
        bestTimeToVisit: "Nov–Feb, morning or late afternoon",
        famousFor: "Queen of beaches, water sports, beach shacks",
        imageUrl: "https://images.unsplash.com/photo-1512343879784-a960cd67eb2b?w=800",
        suggestedDuration: "2–3 hours",
        sellingPrice: 0,
      },
      {
        name: "Baga Beach",
        description: "Lively stretch next to Calangute with nightlife, clubs and adventure sports. Great for evening energy.",
        bestTimeToVisit: "Nov–Mar evenings",
        famousFor: "Nightlife, parasailing, Tito's lane",
        imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
        suggestedDuration: "2–4 hours",
        sellingPrice: 1500,
      },
      {
        name: "Fort Aguada",
        description: "17th-century Portuguese fort with lighthouse views over the Arabian Sea. Photo stop and history briefing.",
        bestTimeToVisit: "Morning for cooler weather and clear views",
        famousFor: "Portuguese fort, lighthouse, sea panorama",
        imageUrl: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=800",
        suggestedDuration: "1–1.5 hours",
      },
      {
        name: "Basilica of Bom Jesus",
        description: "UNESCO World Heritage church housing the relics of St. Francis Xavier. Respectful dress code advised.",
        bestTimeToVisit: "Morning (opens early; avoid Sunday mass crowds)",
        famousFor: "UNESCO site, St. Francis Xavier relics",
        imageUrl: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800",
        suggestedDuration: "45–60 mins",
      },
      {
        name: "Dudhsagar Falls",
        description: "Four-tiered waterfall on the Goa–Karnataka border. Trek or jeep safari depending on season and fitness.",
        bestTimeToVisit: "Monsoon to early winter (Jul–Dec) when flow is strong",
        famousFor: "Towering waterfall, jeep safari, jungle trek",
        imageUrl: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=800",
        suggestedDuration: "Half day",
        sellingPrice: 3500,
      },
      {
        name: "Anjuna Flea Market",
        description: "Iconic Wednesday market for crafts, clothes and souvenirs. Combine with Anjuna beach time.",
        bestTimeToVisit: "Wednesday mornings (market day)",
        famousFor: "Flea market, hippie vibe, handicrafts",
        imageUrl: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800",
        suggestedDuration: "2–3 hours",
      },
    ],
  },
  Mumbai: {
    country: "India",
    places: [
      {
        name: "Gateway of India",
        description: "Iconic monument overlooking the harbour — classic photo stop and ferry point to Elephanta.",
        bestTimeToVisit: "Early morning or sunset",
        famousFor: "Colonial arch, harbour views, ferry pier",
        imageUrl: "https://images.unsplash.com/photo-1566552881560-0be862a2c272?w=800",
        suggestedDuration: "45–60 mins",
      },
      {
        name: "Marine Drive",
        description: "Queen's Necklace promenade along the Arabian Sea. Ideal evening stroll and night skyline views.",
        bestTimeToVisit: "Sunset to late evening",
        famousFor: "Sea promenade, night lights, Chowpatty",
        imageUrl: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=800",
        suggestedDuration: "1–2 hours",
      },
      {
        name: "Elephanta Caves",
        description: "UNESCO rock-cut cave temples on Elephanta Island. Ferry from Gateway of India.",
        bestTimeToVisit: "Morning ferries (Tue–Sun; closed Mondays)",
        famousFor: "UNESCO caves, Shiva sculptures, island ferry",
        imageUrl: "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800",
        suggestedDuration: "Half day",
        sellingPrice: 2500,
      },
    ],
  },
  Singapore: {
    country: "Singapore",
    places: [
      {
        name: "Marina Bay Sands",
        description: "Iconic skyline landmark with infinity pool views, ArtScience Museum and light shows at the bay.",
        bestTimeToVisit: "Evening for Spectra light show",
        famousFor: "SkyPark views, light show, shopping",
        imageUrl: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800",
        suggestedDuration: "2–3 hours",
      },
      {
        name: "Gardens by the Bay",
        description: "Supertree Grove, Flower Dome and Cloud Forest — Singapore's signature green attraction.",
        bestTimeToVisit: "Late afternoon into Garden Rhapsody light show",
        famousFor: "Supertrees, conservatories, light show",
        imageUrl: "https://images.unsplash.com/photo-1508964942454-1a566964d72a?w=800",
        suggestedDuration: "3–4 hours",
        sellingPrice: 4500,
      },
      {
        name: "Sentosa Island",
        description: "Resort island with beaches, Universal Studios and cable car access. Plan a full leisure day.",
        bestTimeToVisit: "Full day; mornings less crowded",
        famousFor: "Beaches, Universal Studios, cable car",
        imageUrl: "https://images.unsplash.com/photo-1555212697-194d092e3b8f?w=800",
        suggestedDuration: "Full day",
        sellingPrice: 6000,
      },
      {
        name: "Universal Studios Singapore",
        description: "Theme park with movie-based rides and shows. Book timed tickets in advance for peak season.",
        bestTimeToVisit: "Weekday mornings at park open",
        famousFor: "Theme park rides, Hollywood Boulevard",
        imageUrl: "https://images.unsplash.com/photo-1569662947556-5c389874a0ab?w=800",
        suggestedDuration: "Full day",
        sellingPrice: 8500,
      },
    ],
  },
  Dubai: {
    country: "UAE",
    places: [
      {
        name: "Burj Khalifa",
        description: "World's tallest tower — At the Top observation decks with skyline and fountain views.",
        bestTimeToVisit: "Sunset slot for day-to-night views",
        famousFor: "Observation deck, Dubai Fountain views",
        imageUrl: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800",
        suggestedDuration: "1.5–2 hours",
        sellingPrice: 12000,
      },
      {
        name: "Dubai Mall",
        description: "Mega mall with aquarium, fountain views and luxury shopping. Combine with Burj Khalifa.",
        bestTimeToVisit: "Evening when fountain shows run",
        famousFor: "Shopping, aquarium, Dubai Fountain",
        imageUrl: "https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=800",
        suggestedDuration: "2–4 hours",
      },
      {
        name: "Palm Jumeirah",
        description: "Palm-shaped island with Atlantis, beaches and monorail views. Photo stop + beach time.",
        bestTimeToVisit: "Late afternoon to sunset",
        famousFor: "Palm island, Atlantis, beach resorts",
        imageUrl: "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=800",
        suggestedDuration: "2–3 hours",
      },
      {
        name: "Desert Safari",
        description: "Dune bashing, camel ride, BBQ dinner and cultural shows in the desert — classic Dubai evening.",
        bestTimeToVisit: "Afternoon pickup for sunset dune run",
        famousFor: "Dune bashing, camel ride, desert BBQ",
        imageUrl: "https://images.unsplash.com/photo-1451337516015-6b6e9a44a8a3?w=800",
        suggestedDuration: "Half day / evening",
        sellingPrice: 5500,
      },
    ],
  },
  Bali: {
    country: "Indonesia",
    places: [
      {
        name: "Ubud Rice Terraces",
        description: "Tegalalang terraces — classic Bali landscape walks and viewpoint photos among emerald paddies.",
        bestTimeToVisit: "Early morning for soft light and fewer crowds",
        famousFor: "Rice terraces, swing photos, Ubud culture",
        imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab0?w=800",
        suggestedDuration: "1.5–2 hours",
        sellingPrice: 1500,
      },
      {
        name: "Tanah Lot Temple",
        description: "Sea temple on a rocky outcrop — iconic sunset temple visit on Bali's west coast.",
        bestTimeToVisit: "Late afternoon for sunset",
        famousFor: "Ocean temple, sunset views",
        imageUrl: "https://images.unsplash.com/photo-1555400038-63f5ba517fbd?w=800",
        suggestedDuration: "1.5–2 hours",
      },
      {
        name: "Uluwatu Temple",
        description: "Cliff-top temple with ocean views and Kecak dance performances at sunset.",
        bestTimeToVisit: "Sunset for Kecak dance",
        famousFor: "Cliff temple, Kecak dance, ocean views",
        imageUrl: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800",
        suggestedDuration: "2–3 hours",
        sellingPrice: 2000,
      },
      {
        name: "Seminyak Beach",
        description: "Stylish beach belt for sunsets, beach clubs and shopping. Soft leisure afternoon.",
        bestTimeToVisit: "Late afternoon sunset",
        famousFor: "Beach clubs, sunsets, boutique shopping",
        imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab0?w=800",
        suggestedDuration: "2–3 hours",
      },
    ],
  },
  Malacca: {
    country: "Malaysia",
    places: [
      {
        name: "Jonker Street",
        description: "Historic Chinatown street for night market, street food and heritage shophouses.",
        bestTimeToVisit: "Evening for night market (Fri–Sun)",
        famousFor: "Night market, street food, heritage vibe",
        imageUrl: "https://images.unsplash.com/photo-1596422846543-75c6fc71073a?w=800",
        suggestedDuration: "2–3 hours",
      },
      {
        name: "A Famosa / Porta de Santiago",
        description: "Iconic 16th-century Portuguese fort gate — classic Malacca photo stop.",
        bestTimeToVisit: "Morning or late afternoon",
        famousFor: "Portuguese fort, heritage photos",
        imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        suggestedDuration: "45–60 mins",
      },
      {
        name: "Dutch Square (Red Square)",
        description: "Stadthuys and Christ Church in the famous red colonial square.",
        bestTimeToVisit: "Morning for cooler photos",
        famousFor: "Red buildings, Christ Church, trishaws",
        imageUrl: "https://images.unsplash.com/photo-1555881400-74d7afaac0b5?w=800",
        suggestedDuration: "1–1.5 hours",
      },
      {
        name: "Melaka River Cruise",
        description: "Short river cruise past murals and illuminated bridges — good evening activity.",
        bestTimeToVisit: "Evening for lights",
        famousFor: "River views, murals, night lights",
        imageUrl: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800",
        suggestedDuration: "45 mins",
        sellingPrice: 1200,
      },
    ],
  },
  "Mainland Penang": {
    country: "Malaysia",
    places: [
      {
        name: "Penang Hill",
        description: "Cool hilltop with funicular ride and island views over George Town.",
        bestTimeToVisit: "Late afternoon for sunset",
        famousFor: "Funicular, viewpoints, cooler air",
        imageUrl: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800",
        suggestedDuration: "3–4 hours",
        sellingPrice: 2500,
      },
      {
        name: "George Town Street Art",
        description: "Walkable murals and heritage lanes in UNESCO George Town.",
        bestTimeToVisit: "Morning or late afternoon",
        famousFor: "Murals, cafes, heritage streets",
        imageUrl: "https://images.unsplash.com/photo-1596422846543-75c6fc71073a?w=800",
        suggestedDuration: "2–3 hours",
      },
      {
        name: "Kek Lok Si Temple",
        description: "Largest Buddhist temple complex in Malaysia with pagoda and gardens.",
        bestTimeToVisit: "Morning",
        famousFor: "Temple complex, pagoda, gardens",
        imageUrl: "https://images.unsplash.com/photo-1548013146-72479768bada?w=800",
        suggestedDuration: "1.5–2 hours",
      },
    ],
  },
  Penang: {
    country: "Malaysia",
    places: [
      {
        name: "Batu Ferringhi Beach",
        description: "Beach belt north of the island — evening market and seaside walk.",
        bestTimeToVisit: "Evening for night market",
        famousFor: "Beach, night market, seafood",
        imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
        suggestedDuration: "2–3 hours",
      },
    ],
  },
  "Kuala Lumpur": {
    country: "Malaysia",
    places: [
      {
        name: "Petronas Twin Towers",
        description: "Iconic twin towers and KLCC park — skybridge visit when tickets available.",
        bestTimeToVisit: "Evening for lights; book skybridge ahead",
        famousFor: "Skyline icon, KLCC park",
        imageUrl: "https://images.unsplash.com/photo-1596422846543-75c6fc71073a?w=800",
        suggestedDuration: "2 hours",
        sellingPrice: 3000,
      },
      {
        name: "Batu Caves",
        description: "Limestone caves and temple complex north of KL — short day trip staple.",
        bestTimeToVisit: "Morning to avoid heat and crowds",
        famousFor: "Cave temple, rainbow staircase",
        imageUrl: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800",
        suggestedDuration: "2–3 hours",
      },
      {
        name: "Merdeka Square",
        description: "Historic independence square with colonial buildings and flagpole.",
        bestTimeToVisit: "Late afternoon",
        famousFor: "Independence history, architecture",
        imageUrl: "https://images.unsplash.com/photo-1555881400-74d7afaac0b5?w=800",
        suggestedDuration: "1 hour",
      },
    ],
  },
  Langkawi: {
    country: "Malaysia",
    places: [
      {
        name: "Langkawi Cable Car / SkyCab",
        description: "Cable car to mountain viewpoints with skybridge options.",
        bestTimeToVisit: "Morning for clearer views",
        famousFor: "Cable car, skybridge, panorama",
        imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
        suggestedDuration: "3–4 hours",
        sellingPrice: 4500,
      },
      {
        name: "Cenang Beach",
        description: "Main tourist beach for sunsets, water sports and evening energy.",
        bestTimeToVisit: "Sunset",
        famousFor: "Beach sunset, nightlife strip",
        imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
        suggestedDuration: "2–3 hours",
      },
    ],
  },
  "Genting Highlands": {
    country: "Malaysia",
    places: [
      {
        name: "Genting SkyWorlds / Theme Park",
        description: "Hilltop theme park and outdoor attractions (ticketed experiences).",
        bestTimeToVisit: "Weekday mornings for shorter queues",
        famousFor: "Theme park, cool climate",
        imageUrl: "https://images.unsplash.com/photo-1519046904884-4511a574a82b?w=800",
        suggestedDuration: "Half / full day",
        sellingPrice: 8000,
      },
      {
        name: "Chin Swee Caves Temple",
        description: "Scenic temple complex on the way up to Genting — photo and prayer stop.",
        bestTimeToVisit: "Morning",
        famousFor: "Temple views, mountain setting",
        imageUrl: "https://images.unsplash.com/photo-1548013146-72479768bada?w=800",
        suggestedDuration: "1–1.5 hours",
      },
    ],
  },
};

async function main() {
  let created = 0;
  let skipped = 0;
  for (const [city, meta] of Object.entries(PLACES)) {
    const dest = await db.destination.findFirst({
      where: {
        OR: [
          { name: { equals: city, mode: "insensitive" } },
          { city: { equals: city, mode: "insensitive" } },
        ],
        country: { equals: meta.country, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (!dest) {
      console.log(`skip missing destination: ${city}`);
      continue;
    }
    let order = 0;
    for (const place of meta.places) {
      const existing = await db.sightseeingPlace.findFirst({
        where: {
          destinationId: dest.id,
          name: { equals: place.name, mode: "insensitive" },
        },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await db.sightseeingPlace.create({
        data: {
          agencyId: dest.agencyId,
          destinationId: dest.id,
          name: place.name,
          description: place.description,
          bestTimeToVisit: place.bestTimeToVisit,
          famousFor: place.famousFor,
          imageUrl: place.imageUrl,
          suggestedDuration: place.suggestedDuration || null,
          sellingPrice: place.sellingPrice ?? null,
          currency: "INR",
          status: "Active",
          sortOrder: order++,
        },
      });
      created += 1;
    }
    console.log(`ok ${city}: seeded places`);
  }
  console.log(JSON.stringify({ ok: true, created, skipped }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
