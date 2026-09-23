/**
 * Import Malaysia inventory from freshly parsed Excels + curated catalog.
 *
 * - Hotels / T&Cs: scripts/malaysia-from-excel.json  (Malaysia Contracted rates .xlsx)
 * - Transfers / tickets / guides: scripts/malaysia-catalog.json  (KTH RATE SHEET 2026)
 *
 * Usage: npx tsx scripts/import-malaysia-from-excel.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: ["error", "warn"] });
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = resolve(__dirname, "../../scripts/malaysia-from-excel.json");
const CATALOG_PATH = resolve(__dirname, "../../scripts/malaysia-catalog.json");

const HOTEL_SOURCE = "malaysia-contracted-rates.xlsx";
const KTH_SOURCE = "KTH RATE SHEET 2026 - TREVIO.xlsx";

type RoomWindow = { validFrom: string; validTo: string };

type HotelRoom = {
  name: string;
  usd: number;
  extraBedUsd?: number | null;
  inr: number;
  extraBedInr?: number | null;
  season?: string | null;
  validFrom?: string;
  validTo?: string;
  windows?: RoomWindow[] | null;
};

type HotelRow = {
  name: string;
  city: string;
  country: string;
  starCategory: number;
  rooms: HotelRoom[];
};

type ExcelBundle = {
  source: {
    hotelValidFrom: string;
    hotelValidTo: string;
    kthValidFrom: string;
    kthValidTo: string;
    fx: { USD_TO_INR: number; MYR_TO_INR: number };
    roeNote?: string;
  };
  terms: {
    hotels: string;
    kthKualaLumpur: string;
    kthLangkawi: string;
    kthPenang: string;
  };
  hotels: HotelRow[];
};

type Catalog = {
  source: { validFrom: string; validTo: string };
  transfers: Array<{
    name: string;
    city: string;
    country: string;
    myr: { car: number; van10?: number | null; van18?: number | null; van18Guide?: number | null };
    inr: { car: number; van10?: number | null; van18?: number | null; van18Guide?: number | null };
  }>;
  tickets: Array<{
    name: string;
    city: string;
    country: string;
    adultMyr: number;
    childMyr?: number | null;
    adultInr: number;
    childInr?: number | null;
  }>;
  guides: Array<{ name: string; city: string; country: string; myr: number; inr: number }>;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function inferPickupDrop(name: string): { pickup: string; drop: string } {
  const m = name.match(/from\s+(.+?)\s+-\s+(.+?)(?:\s*\(|$)/i);
  if (m) return { pickup: m[1].trim(), drop: m[2].trim() };
  return { pickup: "As per itinerary", drop: "As per itinerary" };
}

/** Star-based defaults — Excel rate sheet has no amenity checklist. */
function defaultAmenities(stars: number): string[] {
  const base = ["Wi-Fi", "Air conditioning", "Daily housekeeping", "Front desk"];
  if (stars >= 4) base.push("Restaurant", "Room service", "Fitness centre");
  if (stars >= 5) base.push("Concierge", "Spa / wellness", "Pool");
  return base;
}

function kthTermsForCity(city: string, terms: ExcelBundle["terms"]): string {
  if (city === "Langkawi") return terms.kthLangkawi || terms.kthKualaLumpur;
  if (city === "Penang") return terms.kthPenang || terms.kthKualaLumpur;
  return terms.kthKualaLumpur;
}

async function ensureDestination(city: string, country = "Malaysia", extra?: Record<string, unknown>) {
  const slug = slugify(`${city}-${country}`);
  const existing = await db.destination.findFirst({
    where: {
      OR: [
        { slug },
        {
          AND: [
            { name: { equals: city, mode: "insensitive" } },
            { country: { equals: country, mode: "insensitive" } },
          ],
        },
      ],
    },
  });
  const data = {
    name: city,
    country,
    city,
    shortDescription: `${city}, ${country} — Trevio contracted ground inventory`,
    currency: "INR",
    status: "Active",
    visaRequired: true,
    metadata: { source: HOTEL_SOURCE, ...(extra || {}) },
  };
  if (existing) {
    return db.destination.update({
      where: { id: existing.id },
      data: {
        ...data,
        metadata: {
          ...((existing.metadata as object) || {}),
          ...data.metadata,
        },
      },
    });
  }
  return db.destination.create({ data: { ...data, slug } });
}

async function ensureSupplier(name: string, type: string) {
  const existing = await db.supplier.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return existing;
  return db.supplier.create({
    data: { name, type, country: "Malaysia", status: "Active", notes: `Imported with ${HOTEL_SOURCE} / ${KTH_SOURCE}` },
  });
}

async function upsertHotelRate(opts: {
  productId: string;
  roomType: string;
  contractedCost: number;
  extraBedInr?: number | null;
  sourceUsd: number;
  extraBedUsd?: number | null;
  validFrom: string;
  validTo: string;
  season?: string | null;
}) {
  const all = await db.contractedRate.findMany({
    where: {
      productType: "HOTEL",
      productId: opts.productId,
      active: true,
      validFrom: opts.validFrom,
      validTo: opts.validTo,
    },
  });
  const existing = all.find((row) => {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    return String(meta.roomType || "") === opts.roomType;
  });
  const data = {
    agencyId: null as string | null,
    currency: "INR",
    rateUnit: "PER_ROOM_NIGHT",
    contractedCost: Math.max(1, Math.round(opts.contractedCost)),
    metadata: {
      roomType: opts.roomType,
      source: HOTEL_SOURCE,
      sourceUsd: opts.sourceUsd,
      extraBedInr: opts.extraBedInr ?? undefined,
      extraBedUsd: opts.extraBedUsd ?? undefined,
      season: opts.season || undefined,
      bookingValidTo: "2026-09-30",
    } as object,
  };
  if (existing) {
    await db.contractedRate.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await db.contractedRate.create({
    data: {
      productType: "HOTEL",
      productId: opts.productId,
      validFrom: opts.validFrom,
      validTo: opts.validTo,
      active: true,
      ...data,
    },
  });
  return created.id;
}

async function upsertGenericRate(opts: {
  productType: "TRANSFER" | "ACTIVITY";
  productId: string;
  contractedCost: number;
  validFrom: string;
  validTo: string;
  rateUnit: string;
  metadata: Record<string, unknown>;
}) {
  const existing = await db.contractedRate.findFirst({
    where: {
      productType: opts.productType,
      productId: opts.productId,
      active: true,
      validFrom: opts.validFrom,
      validTo: opts.validTo,
    },
  });
  const data = {
    agencyId: null as string | null,
    currency: "INR",
    rateUnit: opts.rateUnit,
    contractedCost: Math.max(1, Math.round(opts.contractedCost)),
    metadata: opts.metadata as object,
  };
  if (existing) {
    await db.contractedRate.update({ where: { id: existing.id }, data });
    return;
  }
  await db.contractedRate.create({
    data: {
      productType: opts.productType,
      productId: opts.productId,
      validFrom: opts.validFrom,
      validTo: opts.validTo,
      active: true,
      ...data,
    },
  });
}

async function importHotels(excel: ExcelBundle, supplierId: string) {
  let created = 0;
  let updated = 0;
  let rates = 0;

  for (const city of ["Kuala Lumpur", "Genting Highlands", "Langkawi"]) {
    await ensureDestination(city, "Malaysia", {
      hotelTerms: excel.terms.hotels,
      hotelRateValidity: excel.source.hotelValidTo,
      roeNote: excel.source.roeNote,
    });
  }

  for (const h of excel.hotels) {
    if (!h.rooms?.length) continue;
    const dest = await ensureDestination(h.city, h.country, {
      hotelTerms: excel.terms.hotels,
      hotelRateValidity: excel.source.hotelValidTo,
    });

    const roomCategories = h.rooms.map((r) => ({
      name: r.name,
      mealPlan: "Breakfast",
      extraBedAllowed: r.extraBedInr != null,
      pricing: {
        single: r.inr,
        double: r.inr,
        extraAdult: r.extraBedInr ?? undefined,
      },
      sourceUsd: r.usd,
      sourceExtraBedUsd: r.extraBedUsd ?? undefined,
      season: r.season || undefined,
    }));

    const existing = await db.hotelProduct.findFirst({
      where: {
        name: { equals: h.name, mode: "insensitive" },
        city: { equals: h.city, mode: "insensitive" },
        country: "Malaysia",
      },
    });

    const payload = {
      agencyId: null as string | null,
      supplierId,
      destinationId: dest.id,
      name: h.name,
      description: `Malaysia contracted hotel — ${h.city}. USD rate sheet × ${excel.source.fx.USD_TO_INR} → INR. ${excel.source.roeNote || ""}`.trim(),
      starCategory: Math.min(5, Math.max(1, Number(h.starCategory) || 3)),
      city: h.city,
      country: "Malaysia",
      currency: "INR",
      amenities: defaultAmenities(h.starCategory),
      checkInTime: "15:00",
      checkOutTime: "12:00",
      roomCategories,
      contractStart: excel.source.hotelValidFrom,
      contractEnd: excel.source.hotelValidTo,
      status: "Active",
      approvalStatus: "Approved",
      cancellationPolicy: excel.terms.hotels || "As per hotel / supplier policy",
      policies: {
        termsSource: HOTEL_SOURCE,
        bookingValidTo: excel.source.hotelValidTo,
        checkIn: "15:00",
        checkOut: "12:00",
        governmentTaxes: {
          tourismTaxRm: 10,
          pahangSustainabilityTaxRm: h.city === "Genting Highlands" ? 3 : null,
          langkawiStateTourismFeeMyr: h.city === "Langkawi" ? "3-5" : null,
        },
        roeNote: excel.source.roeNote,
      },
    };

    let productId: string;
    if (existing) {
      await db.hotelProduct.update({ where: { id: existing.id }, data: payload });
      productId = existing.id;
      updated += 1;
    } else {
      const row = await db.hotelProduct.create({ data: payload });
      productId = row.id;
      created += 1;
    }

    for (const room of h.rooms) {
      const windows =
        room.windows && room.windows.length
          ? room.windows
          : [
              {
                validFrom: room.validFrom || excel.source.hotelValidFrom,
                // Travel may fall after booking cut-off (30 Sep); keep window through year-end for Dash Dec HS.
                validTo: room.season === "High Season" ? "2026-12-20" : "2026-12-31",
              },
            ];
      for (const w of windows) {
        await upsertHotelRate({
          productId,
          roomType: room.name,
          contractedCost: room.inr,
          extraBedInr: room.extraBedInr,
          sourceUsd: room.usd,
          extraBedUsd: room.extraBedUsd,
          validFrom: w.validFrom,
          validTo: w.validTo,
          season: room.season,
        });
        rates += 1;
      }
    }
  }

  return { created, updated, rates };
}

async function importTransfers(catalog: Catalog, excel: ExcelBundle, supplierId: string) {
  let created = 0;
  let updated = 0;
  let skippedTerms = 0;

  for (const city of ["Kuala Lumpur", "Langkawi", "Penang", "Genting Highlands"]) {
    await ensureDestination(city);
  }

  for (const t of catalog.transfers) {
    if (/terms\s*&?\s*conditions/i.test(t.name)) {
      skippedTerms += 1;
      continue;
    }
    const dest = await ensureDestination(t.city, t.country);
    const { pickup, drop } = inferPickupDrop(t.name);
    const vehiclePricing = [
      { vehicleType: "Sedan / Car", seats: 3, price: t.inr.car },
      t.inr.van10 != null ? { vehicleType: "Van 10-seater", seats: 6, price: t.inr.van10 } : null,
      t.inr.van18 != null ? { vehicleType: "Van 18-seater", seats: 13, price: t.inr.van18 } : null,
      t.inr.van18Guide != null ? { vehicleType: "Van 18-seater + Guide", seats: 13, price: t.inr.van18Guide } : null,
    ].filter(Boolean);

    const existing = await db.transferProduct.findFirst({
      where: {
        name: { equals: t.name, mode: "insensitive" },
        city: { equals: t.city, mode: "insensitive" },
      },
    });

    const payload = {
      agencyId: null as string | null,
      supplierId,
      destinationId: dest.id,
      name: t.name,
      city: t.city,
      description: `KTH Malaysia transfer 2026 (MYR→INR). Source car rate MYR ${t.myr.car}.`,
      transferType: "Private",
      vehicleType: "Sedan / Car",
      capacity: 3,
      pickupLocation: pickup,
      dropLocation: drop,
      privatePrice: t.inr.car,
      vehiclePricing,
      currency: "INR",
      rateValidFrom: catalog.source.validFrom,
      rateValidTo: catalog.source.validTo,
      status: "Active",
      approvalStatus: "Approved",
      cancellationPolicy: kthTermsForCity(t.city, excel.terms) || "As per KTH supplier policy",
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

    await upsertGenericRate({
      productType: "TRANSFER",
      productId,
      contractedCost: t.inr.car,
      validFrom: catalog.source.validFrom,
      validTo: catalog.source.validTo,
      rateUnit: "PER_VEHICLE",
      metadata: { source: KTH_SOURCE, vehicleType: "Sedan / Car", sourceMyr: t.myr.car },
    });
  }

  return { created, updated, skippedTerms };
}

async function importTickets(catalog: Catalog, excel: ExcelBundle, supplierId: string) {
  let created = 0;
  let updated = 0;
  for (const t of catalog.tickets) {
    if (/terms\s*&?\s*conditions/i.test(t.name)) continue;
    const dest = await ensureDestination(t.city, t.country);
    const existing = await db.activityProduct.findFirst({
      where: {
        name: { equals: t.name, mode: "insensitive" },
        location: { equals: t.city, mode: "insensitive" },
      },
    });
    const payload = {
      agencyId: null as string | null,
      supplierId,
      destinationId: dest.id,
      name: t.name,
      location: t.city,
      description: `Malaysia attraction ticket (KTH 2026). Adult MYR ${t.adultMyr}.`,
      duration: "As per ticket",
      adultPrice: t.adultInr,
      childPrice: t.childInr ?? undefined,
      currency: "INR",
      rateValidFrom: catalog.source.validFrom,
      rateValidTo: catalog.source.validTo,
      status: "Active",
      approvalStatus: "Approved",
      cancellationPolicy: excel.terms.kthKualaLumpur || "As per KTH supplier policy",
    };
    let productId: string;
    if (existing) {
      await db.activityProduct.update({ where: { id: existing.id }, data: payload });
      productId = existing.id;
      updated += 1;
    } else {
      const row = await db.activityProduct.create({ data: payload });
      productId = row.id;
      created += 1;
    }
    await upsertGenericRate({
      productType: "ACTIVITY",
      productId,
      contractedCost: t.adultInr,
      validFrom: catalog.source.validFrom,
      validTo: catalog.source.validTo,
      rateUnit: "PER_PAX",
      metadata: { source: `${KTH_SOURCE} - TICKET`, adultMyr: t.adultMyr, childMyr: t.childMyr ?? undefined },
    });
  }
  return { created, updated };
}

async function importGuides(catalog: Catalog, excel: ExcelBundle, supplierId: string) {
  let created = 0;
  let updated = 0;
  for (const g of catalog.guides) {
    if (/terms\s*&?\s*conditions/i.test(g.name)) continue;
    const dest = await ensureDestination(g.city, g.country);
    const existing = await db.activityProduct.findFirst({
      where: {
        name: { equals: g.name, mode: "insensitive" },
        location: { equals: g.city, mode: "insensitive" },
      },
    });
    const payload = {
      agencyId: null as string | null,
      supplierId,
      destinationId: dest.id,
      name: g.name,
      location: g.city,
      description: `KTH guide service 2026 (MYR ${g.myr}).`,
      duration: "As per booking",
      adultPrice: g.inr,
      currency: "INR",
      rateValidFrom: catalog.source.validFrom,
      rateValidTo: catalog.source.validTo,
      status: "Active",
      approvalStatus: "Approved",
      cancellationPolicy: kthTermsForCity(g.city, excel.terms) || "As per KTH supplier policy",
    };
    let productId: string;
    if (existing) {
      await db.activityProduct.update({ where: { id: existing.id }, data: payload });
      productId = existing.id;
      updated += 1;
    } else {
      const row = await db.activityProduct.create({ data: payload });
      productId = row.id;
      created += 1;
    }
    await upsertGenericRate({
      productType: "ACTIVITY",
      productId,
      contractedCost: g.inr,
      validFrom: catalog.source.validFrom,
      validTo: catalog.source.validTo,
      rateUnit: "PER_SERVICE",
      metadata: { source: `${KTH_SOURCE} - GUIDE`, sourceMyr: g.myr },
    });
  }
  return { created, updated };
}

async function main() {
  const excel = JSON.parse(readFileSync(EXCEL_PATH, "utf8")) as ExcelBundle;
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Catalog;

  console.log("Importing Malaysia from Excels…");
  console.log({
    hotels: excel.hotels.length,
    rooms: excel.hotels.reduce((n, h) => n + h.rooms.length, 0),
    transfers: catalog.transfers.length,
    tickets: catalog.tickets.length,
    guides: catalog.guides.length,
  });

  const hotelSupplier = await ensureSupplier("Malaysia Contracted Hotels", "Hotel");
  const kthSupplier = await ensureSupplier("KTH Malaysia", "DMC");

  const hotels = await importHotels(excel, hotelSupplier.id);
  const transfers = await importTransfers(catalog, excel, kthSupplier.id);
  const tickets = await importTickets(catalog, excel, kthSupplier.id);
  const guides = await importGuides(catalog, excel, kthSupplier.id);

  // Soft-disable any accidental Terms product rows
  const bad = await db.transferProduct.findMany({
    where: { name: { contains: "Terms", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  for (const row of bad) {
    await db.transferProduct.update({ where: { id: row.id }, data: { status: "Archived" } });
  }

  console.log(JSON.stringify({ ok: true, hotels, transfers, tickets, guides, archivedTermsRows: bad.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
