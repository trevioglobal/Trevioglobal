/**
 * Seed Indian Lunch / Dinner meal products (with / without private transfer).
 * Usage: npx tsx scripts/import-meals.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: ["error", "warn"] });

const VALID_FROM = "2026-01-01";
const VALID_TO = "2026-12-31";

const DINNER_RESTAURANTS =
  "Any of these — India Talks, Bollywood Masalaz Kuta, Bollywood Masalaz Ubud, and other contracted Indian restaurants";

const MEALS = [
  {
    name: "Lunch at Indian Restaurant without Transfer",
    mealType: "Lunch",
    transferInclusion: "NONE" as const,
    adultPrice: 1602,
    description: "Lunch at Indian Restaurant without Transfer",
    restaurant: null as string | null,
    duration: "",
  },
  {
    name: "Lunch at Indian Restaurant with Transfer",
    mealType: "Lunch",
    transferInclusion: "PRIVATE" as const,
    adultPrice: 3535,
    description: "Lunch at Indian Restaurant with Transfer",
    restaurant: null,
    duration: "6 Hours",
  },
  {
    name: "Dinner at Indian Restaurant without Transfer",
    mealType: "Dinner",
    transferInclusion: "NONE" as const,
    adultPrice: 1602,
    description: "Dinner at Indian Restaurant without Transfer",
    restaurant: DINNER_RESTAURANTS,
    duration: "",
  },
  {
    name: "Dinner at Indian Restaurant with Transfer",
    mealType: "Dinner",
    transferInclusion: "PRIVATE" as const,
    adultPrice: 3535,
    description: "Dinner at Indian Restaurant with Transfer",
    restaurant: DINNER_RESTAURANTS,
    duration: "6 Hours",
  },
];

async function ensureSupplier() {
  const existing = await db.supplier.findFirst({
    where: { name: { equals: "Contracted Meals", mode: "insensitive" } },
  });
  if (existing) return existing;
  return db.supplier.create({
    data: { name: "Contracted Meals", type: "DMC", country: "Malaysia", status: "Active" },
  });
}

async function upsertRate(productId: string, contractedCost: number, transferInclusion: string) {
  const existing = await db.contractedRate.findFirst({
    where: {
      productType: "MEAL",
      productId,
      active: true,
      validFrom: VALID_FROM,
      validTo: VALID_TO,
    },
  });
  const data = {
    currency: "INR",
    rateUnit: "PER_PASSENGER",
    contractedCost: Math.max(1, Math.round(contractedCost)),
    metadata: {
      source: "MEALS LIST",
      transferInclusion,
    },
  };
  if (existing) {
    await db.contractedRate.update({ where: { id: existing.id }, data });
    return;
  }
  await db.contractedRate.create({
    data: {
      productType: "MEAL",
      productId,
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      active: true,
      ...data,
    },
  });
}

async function findExistingMeal(meal: (typeof MEALS)[number]) {
  const byType = await db.mealProduct.findFirst({
    where: {
      mealType: meal.mealType,
      transferInclusion: meal.transferInclusion,
      OR: [
        { name: { equals: meal.name, mode: "insensitive" } },
        { name: { contains: "Indian Lunch", mode: "insensitive" } },
        { name: { contains: "Indian dinner", mode: "insensitive" } },
        { name: { contains: "Indian Dinner", mode: "insensitive" } },
        { name: { contains: "at Indian Restaurant", mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
  if (byType) return byType;
  return db.mealProduct.findFirst({
    where: {
      mealType: meal.mealType,
      transferInclusion: meal.transferInclusion,
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function main() {
  const supplier = await ensureSupplier();
  let created = 0;
  let updated = 0;

  for (const meal of MEALS) {
    const existing = await findExistingMeal(meal);
    const payload = {
      agencyId: null as string | null,
      supplierId: supplier.id,
      destinationId: null as string | null,
      name: meal.name,
      description: meal.description,
      mealType: meal.mealType,
      city: null as string | null,
      restaurant: meal.restaurant,
      transferInclusion: meal.transferInclusion,
      adultPrice: meal.adultPrice,
      childPrice: meal.adultPrice,
      currency: "INR",
      status: "Active",
      approvalStatus: "Approved",
    };
    let productId: string;
    if (existing) {
      await db.mealProduct.update({ where: { id: existing.id }, data: payload });
      productId = existing.id;
      updated += 1;
      console.log(`upd ${meal.transferInclusion} ${meal.adultPrice} ${meal.name}`);
    } else {
      const row = await db.mealProduct.create({ data: payload });
      productId = row.id;
      created += 1;
      console.log(`new ${meal.transferInclusion} ${meal.adultPrice} ${meal.name}`);
    }
    await upsertRate(productId, meal.adultPrice, meal.transferInclusion);
  }

  console.log(JSON.stringify({ ok: true, created, updated, total: MEALS.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
