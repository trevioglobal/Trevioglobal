/** Meal catalogue helpers for trip-builder Private Transfer expansion. */

export const MEAL_TRANSFER_ROUTE = "Hotel → Activity → Hotel (6 Hours)";

/**
 * Agent-facing meal catalogue title.
 * Always: "Lunch|Dinner at Indian Restaurant with|without Transfer"
 */
export function formatMealCatalogTitle(item: {
  name?: unknown;
  mealType?: unknown;
  transferInclusion?: unknown;
  description?: unknown;
}): string {
  const hay = `${item.mealType || ""} ${item.name || ""}`;
  const kind = /\bdinner\b/i.test(hay) ? "Dinner" : "Lunch";
  const withTransfer =
    item.transferInclusion === "PRIVATE"
    || /\bwith\b.*\btransfer\b/i.test(String(item.name || ""))
    || /\bHotel\s*[→\-].*Activity\b/i.test(String(item.description || ""));
  return `${kind} at Indian Restaurant ${withTransfer ? "with" : "without"} Transfer`;
}

/** Private transfer vehicle options shown on meal cards (reference sheet rates). */
export const MEAL_TRANSFER_VEHICLES = [
  { id: "avenza", label: "Avenza", capacity: "1 - 5", price: 1933.32 },
  { id: "innova", label: "Innova", capacity: "3 - 5", price: 3728.54 },
  { id: "hiace", label: "HI - ACE", capacity: "6 - 13", price: 4142.82 },
  { id: "bus", label: "Bus", capacity: "13 - 29", price: 8351.93 },
] as const;

export type MealTransferVehicleId = (typeof MEAL_TRANSFER_VEHICLES)[number]["id"];

export const MEAL_LUNCH_TIME_SLOTS = [
  "12:00 - 13:00",
  "13:00 - 14:00",
  "14:00 - 15:00",
] as const;

export const MEAL_DINNER_TIME_SLOTS = [
  "19:00 - 20:00",
  "20:00 - 21:00",
  "21:00 - 22:00",
] as const;

export function mealTimeSlotsForType(mealType: unknown): readonly string[] {
  return /\bdinner\b/i.test(String(mealType || ""))
    ? MEAL_DINNER_TIME_SLOTS
    : MEAL_LUNCH_TIME_SLOTS;
}

/** Food-only portion of a meal product (strips default Avenza when PRIVATE is bundled). */
export function mealFoodOnlyPrice(item: {
  adultPrice?: unknown;
  transferInclusion?: unknown;
}): number {
  const listed = Math.max(0, Number(item.adultPrice || 0));
  if (item.transferInclusion !== "PRIVATE") return listed;
  const bundled = MEAL_TRANSFER_VEHICLES[0].price;
  const food = Math.round(listed - bundled);
  return food > 0 ? food : listed;
}

export function mealTransferVehicleTotal(qtyById: Record<string, number>): number {
  return MEAL_TRANSFER_VEHICLES.reduce(
    (sum, v) => sum + v.price * Math.max(0, Math.floor(Number(qtyById[v.id] || 0))),
    0,
  );
}

export function defaultMealVehicleQty(): Record<string, number> {
  return Object.fromEntries(
    MEAL_TRANSFER_VEHICLES.map((v) => [v.id, v.id === "avenza" ? 1 : 0]),
  );
}

export function selectedMealVehicles(qtyById: Record<string, number>) {
  return MEAL_TRANSFER_VEHICLES
    .map((v) => ({
      ...v,
      qty: Math.max(0, Math.floor(Number(qtyById[v.id] || 0))),
    }))
    .filter((v) => v.qty > 0);
}
