import { describe, expect, it } from "vitest";
import { formatMealCatalogTitle } from "./meal-catalog";

describe("formatMealCatalogTitle", () => {
  it("formats lunch / dinner with and without transfer", () => {
    expect(formatMealCatalogTitle({ mealType: "Lunch", transferInclusion: "NONE" }))
      .toBe("Lunch at Indian Restaurant without Transfer");
    expect(formatMealCatalogTitle({ mealType: "Lunch", transferInclusion: "PRIVATE" }))
      .toBe("Lunch at Indian Restaurant with Transfer");
    expect(formatMealCatalogTitle({ mealType: "Dinner", transferInclusion: "NONE" }))
      .toBe("Dinner at Indian Restaurant without Transfer");
    expect(formatMealCatalogTitle({ mealType: "Dinner", transferInclusion: "PRIVATE" }))
      .toBe("Dinner at Indian Restaurant with Transfer");
  });

  it("normalizes legacy product names", () => {
    expect(formatMealCatalogTitle({
      name: "Indian Lunch (3 main course set veg menu)",
      mealType: "Lunch",
      transferInclusion: "NONE",
    })).toBe("Lunch at Indian Restaurant without Transfer");
    expect(formatMealCatalogTitle({
      name: "Indian dinner (3 main course veg set menu)",
      mealType: "Dinner",
      transferInclusion: "PRIVATE",
    })).toBe("Dinner at Indian Restaurant with Transfer");
  });
});
