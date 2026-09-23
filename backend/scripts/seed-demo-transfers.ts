/**
 * Seed demo transfer products for common destinations (Langkawi, KL, Penang, Singapore)
 * so quotation "Add Transfers" is not empty during manual agency ops.
 *
 * Usage: npx tsx scripts/seed-demo-transfers.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: ["error", "warn"] });

const VALID_FROM = "2026-01-01";
const VALID_TO = "2027-12-31";

type SeedTransfer = {
  city: string;
  country: string;
  name: string;
  pickup: string;
  drop: string;
  carInr: number;
  transferType?: string;
};

const SEEDS: SeedTransfer[] = [
  {
    city: "Langkawi",
    country: "Malaysia",
    name: "Airport → Hotel (Beach) — Langkawi (demo)",
    pickup: "Langkawi Airport",
    drop: "Langkawi Beach Hotel",
    carInr: 2800,
  },
  {
    city: "Langkawi",
    country: "Malaysia",
    name: "Hotel → Airport (Beach) — Langkawi (demo)",
    pickup: "Langkawi Beach Hotel",
    drop: "Langkawi Airport",
    carInr: 2800,
  },
  {
    city: "Langkawi",
    country: "Malaysia",
    name: "Half-day sightseeing transfer — Langkawi (demo)",
    pickup: "Hotel",
    drop: "Hotel",
    carInr: 4500,
  },
  {
    city: "Kuala Lumpur",
    country: "Malaysia",
    name: "KLIA → City hotel — Kuala Lumpur (demo)",
    pickup: "KLIA",
    drop: "Kuala Lumpur Hotel",
    carInr: 3500,
  },
  {
    city: "Kuala Lumpur",
    country: "Malaysia",
    name: "City hotel → KLIA — Kuala Lumpur (demo)",
    pickup: "Kuala Lumpur Hotel",
    drop: "KLIA",
    carInr: 3500,
  },
  {
    city: "Penang",
    country: "Malaysia",
    name: "Airport → Hotel — Penang (demo)",
    pickup: "Penang Airport",
    drop: "Penang Hotel",
    carInr: 2600,
  },
  {
    city: "Singapore",
    country: "Singapore",
    name: "Airport → Hotel — Singapore (demo)",
    pickup: "Changi Airport",
    drop: "Singapore Hotel",
    carInr: 4200,
  },
  {
    city: "Singapore",
    country: "Singapore",
    name: "Hotel → Airport — Singapore (demo)",
    pickup: "Singapore Hotel",
    drop: "Changi Airport",
    carInr: 4200,
  },
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function ensureDestination(city: string, country: string) {
  const existing = await db.destination.findFirst({
    where: {
      OR: [
        { name: { equals: city, mode: "insensitive" }, country: { equals: country, mode: "insensitive" } },
        { city: { equals: city, mode: "insensitive" }, country: { equals: country, mode: "insensitive" } },
      ],
    },
  });
  if (existing) {
    if (existing.status !== "Active") {
      await db.destination.update({ where: { id: existing.id }, data: { status: "Active" } });
    }
    return existing;
  }
  const base = slugify(`${city}-${country}`);
  let slug = base;
  let n = 1;
  while (await db.destination.findFirst({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return db.destination.create({
    data: {
      name: city,
      city,
      country,
      slug,
      status: "Active",
      shortDescription: `${city}, ${country} — demo destination for quotations`,
    },
  });
}

async function ensureSupplier() {
  const existing = await db.supplier.findFirst({
    where: { name: { contains: "KTH", mode: "insensitive" } },
  });
  if (existing) return existing;
  const any = await db.supplier.findFirst({ orderBy: { createdAt: "asc" } });
  if (any) return any;
  return db.supplier.create({
    data: {
      name: "Demo Transfer Supplier",
      type: "Transport",
      status: "Active",
      country: "Malaysia",
    },
  });
}

async function upsertRate(productId: string, cost: number) {
  const existing = await db.contractedRate.findFirst({
    where: { productType: "TRANSFER", productId, active: true },
  });
  const data = {
    productType: "TRANSFER",
    productId,
    currency: "INR",
    rateUnit: "PER_VEHICLE",
    contractedCost: cost,
    validFrom: VALID_FROM,
    validTo: VALID_TO,
    active: true,
    metadata: { source: "demo-seed", vehicleType: "Sedan / Car" },
  };
  if (existing) {
    await db.contractedRate.update({ where: { id: existing.id }, data });
    return;
  }
  await db.contractedRate.create({ data });
}

async function main() {
  const supplier = await ensureSupplier();
  let created = 0;
  let updated = 0;

  for (const t of SEEDS) {
    const dest = await ensureDestination(t.city, t.country);
    const existing = await db.transferProduct.findFirst({
      where: {
        name: { equals: t.name, mode: "insensitive" },
        city: { equals: t.city, mode: "insensitive" },
      },
    });
    const payload = {
      agencyId: null as string | null,
      supplierId: supplier.id,
      destinationId: dest.id,
      name: t.name,
      city: t.city,
      description: `Demo transfer for ${t.city}. Use in quotations until full supplier rates are loaded.`,
      transferType: t.transferType || "Private",
      vehicleType: "Sedan / Car",
      capacity: 3,
      pickupLocation: t.pickup,
      dropLocation: t.drop,
      privatePrice: t.carInr,
      vehiclePricing: [
        { vehicleType: "Sedan / Car", seats: 3, price: t.carInr },
        { vehicleType: "Van 10-seater", seats: 6, price: Math.round(t.carInr * 1.6) },
      ],
      currency: "INR",
      rateValidFrom: VALID_FROM,
      rateValidTo: VALID_TO,
      status: "Active",
      approvalStatus: "Approved",
      cancellationPolicy: "Demo — as per supplier",
    };

    let productId: string;
    if (existing) {
      await db.transferProduct.update({ where: { id: existing.id }, data: payload });
      productId = existing.id;
      updated += 1;
    } else {
      const row = await db.transferProduct.create({ data: payload });
      productId = row.id;
      created += 1;
    }
    await upsertRate(productId, t.carInr);
  }

  console.log(JSON.stringify({ ok: true, created, updated, totalSeeds: SEEDS.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
