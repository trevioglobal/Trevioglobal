/**
 * Ensure Popular Attractions are filled on major destinations (e.g. Goa)
 * so itinerary place picker is not empty.
 *
 * Usage: npx tsx scripts/seed-destination-attractions.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: ["error", "warn"] });

const ATTRACTIONS: Record<string, { country: string; attractions: string[]; adventures?: string[] }> = {
  Goa: {
    country: "India",
    attractions: [
      "Calangute Beach",
      "Baga Beach",
      "Fort Aguada",
      "Basilica of Bom Jesus",
      "Dudhsagar Falls",
      "Anjuna Flea Market",
      "Old Goa Churches",
      "Chapora Fort",
      "Palolem Beach",
      "Spice Plantation Tour",
    ],
    adventures: ["Water sports at Baga", "Dudhsagar trek", "Night cruise on Mandovi"],
  },
  Singapore: {
    country: "Singapore",
    attractions: [
      "Marina Bay Sands",
      "Gardens by the Bay",
      "Sentosa Island",
      "Universal Studios Singapore",
      "Singapore Zoo",
      "Chinatown",
      "Little India",
      "Orchard Road",
    ],
  },
  "Kuala Lumpur": {
    country: "Malaysia",
    attractions: [
      "Petronas Twin Towers",
      "Batu Caves",
      "KL Tower",
      "Merdeka Square",
      "Chinatown (Petaling Street)",
      "Aquaria KLCC",
      "Thean Hou Temple",
    ],
  },
  Langkawi: {
    country: "Malaysia",
    attractions: [
      "Cable Car & Sky Bridge",
      "Underwater World",
      "Eagle Square",
      "Cenang Beach",
      "Mangrove Tour",
      "Seven Wells Waterfall",
    ],
  },
  Penang: {
    country: "Malaysia",
    attractions: [
      "George Town Heritage Walk",
      "Penang Hill",
      "Kek Lok Si Temple",
      "Batu Ferringhi Beach",
      "Street Art Trail",
    ],
  },
  Dubai: {
    country: "UAE",
    attractions: [
      "Burj Khalifa",
      "Dubai Mall",
      "Palm Jumeirah",
      "Desert Safari",
      "Dubai Marina",
      "Dubai Frame",
    ],
  },
  Bali: {
    country: "Indonesia",
    attractions: [
      "Ubud Rice Terraces",
      "Tanah Lot Temple",
      "Uluwatu Temple",
      "Seminyak Beach",
      "Monkey Forest",
      "Mount Batur",
    ],
  },
};

async function main() {
  let updated = 0;
  for (const [city, meta] of Object.entries(ATTRACTIONS)) {
    const dest = await db.destination.findFirst({
      where: {
        OR: [
          { name: { equals: city, mode: "insensitive" } },
          { city: { equals: city, mode: "insensitive" } },
        ],
        country: { equals: meta.country, mode: "insensitive" },
      },
    });
    if (!dest) {
      console.log(`skip missing destination: ${city}`);
      continue;
    }
    const existing = Array.isArray(dest.popularAttractions)
      ? (dest.popularAttractions as string[]).map((s) => String(s).trim()).filter(Boolean)
      : [];
    if (existing.length >= 5) {
      console.log(`ok ${city}: already has ${existing.length} attractions`);
      continue;
    }
    await db.destination.update({
      where: { id: dest.id },
      data: {
        popularAttractions: meta.attractions,
        adventureActivities: meta.adventures || [],
        status: "Active",
      },
    });
    updated += 1;
    console.log(`updated ${city}: ${meta.attractions.length} attractions`);
  }
  console.log(JSON.stringify({ ok: true, updated }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
