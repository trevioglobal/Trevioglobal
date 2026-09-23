import { describe, expect, it } from "vitest";
import { deriveAgencyCodeBase } from "../lib/agent-codes.js";

describe("agency code derivation", () => {
  it("uses initials for multi-word agency names", () => {
    expect(deriveAgencyCodeBase("Wanderlust Travels")).toBe("WT");
    expect(deriveAgencyCodeBase("Trevio Global Voyage")).toBe("TGV");
  });

  it("uses first letters for single-word names", () => {
    expect(deriveAgencyCodeBase("Malaysia")).toBe("MAL");
    expect(deriveAgencyCodeBase("Go")).toBe("GOA");
  });
});
