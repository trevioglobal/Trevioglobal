import { describe, expect, it } from "vitest";
import { isHiddenVendorName, scrubVendorBrand } from "./scrub-vendor-brand";

describe("scrubVendorBrand", () => {
  it("removes KTH from rate-sheet copy", () => {
    expect(scrubVendorBrand("From Malaysia contracted / KTH rate sheets (2026).")).toBe(
      "From Malaysia contracted / rate sheets (2026).",
    );
  });

  it("removes parenthetical KTH from vehicle labels", () => {
    expect(scrubVendorBrand("18 SEATER ( KTH ) + GUIDE")).toBe("18 SEATER + GUIDE");
  });

  it("rewrites KTH Malaysia supplier label", () => {
    expect(scrubVendorBrand("KTH Malaysia")).toBe("Malaysia");
    expect(isHiddenVendorName("KTH Malaysia")).toBe(true);
  });

  it("scrubs cancellation policy text", () => {
    expect(scrubVendorBrand("As per KTH supplier policy")).toBe("As per supplier policy");
  });
});
