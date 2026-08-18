import { describe, expect, it } from "vitest";
import { calcPackageCosting, sanitizeQuotationForRole } from "../lib/quotations.js";

describe("calcPackageCosting", () => {
  it("rolls hotel + visa lines and tax-inclusive GST", () => {
    const result = calcPackageCosting({
      hotels: [{ costPrice: 8000, sellingPrice: 10000, qty: 1 }],
      flights: [],
      transfers: [],
      activities: [],
      meals: [],
      addOns: [],
      visa: { enabled: true, costPrice: 2000, sellingPrice: 3000 },
      taxRate: 18,
      discountType: "Percentage",
      discountValue: 10,
      adults: 2,
      children: 0,
    });
    expect(result.discountAmount).toBe(1300);
    expect(result.total).toBe(11700);
    expect(result.totalNetCost).toBe(10000);
    expect(result.grossProfit).toBe(1700);
    expect(result.perPersonCost).toBe(5850);
    expect(result.gst).toBeGreaterThan(0);
  });
});

describe("sanitizeQuotationForRole", () => {
  const quote = {
    quoteNo: "TG-QT-2026-000001",
    total: 10000,
    totalNetCost: 7000,
    grossProfit: 3000,
    profitMargin: 30,
    internalNotes: "secret",
    packages: [
      {
        name: "Standard",
        totalNetCost: 7000,
        grossProfit: 3000,
        hotels: [{ hotelName: "Taj", costPrice: 5000, sellingPrice: 7000, supplier: "ABC" }],
      },
    ],
  };

  it("keeps internal fields for employees", () => {
    const out = sanitizeQuotationForRole(quote, "agency_admin");
    expect(out.internalNotes).toBe("secret");
    expect(out.totalNetCost).toBe(7000);
  });

  it("strips cost, supplier, and notes for agents", () => {
    const out = sanitizeQuotationForRole(quote, "travel_agent");
    expect(out.internalNotes).toBeUndefined();
    expect(out.totalNetCost).toBeUndefined();
    expect(out.grossProfit).toBeUndefined();
    const hotel = (out.packages as Array<{ hotels: Array<Record<string, unknown>> }>)[0].hotels[0];
    expect(hotel.hotelName).toBe("Taj");
    expect(hotel.sellingPrice).toBe(7000);
    expect(hotel.costPrice).toBeUndefined();
    expect(hotel.supplier).toBeUndefined();
  });
});
