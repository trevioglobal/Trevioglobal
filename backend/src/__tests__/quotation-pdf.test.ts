import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { assertCustomerSafeModel, buildQuotationPdfModel } from "../lib/quotation-pdf/model.js";
import { renderQuotationPdf } from "../lib/quotation-pdf/render.js";
import { quoteSendBlockReason } from "../lib/quote-access.js";
import { putPrivateObject, objectKey, readPrivateObject } from "../lib/document-storage.js";
import { visibilityAllows } from "../lib/documents.js";

const dir = await mkdtemp(path.join(os.tmpdir(), "trevio-qpdf-"));
process.env.DOCUMENT_STORAGE = "local";
process.env.DOCUMENT_STORAGE_DIR = dir;

const baseQuote = {
  quoteNo: "TG-QT-2026-PDF001",
  customerName: "Dillip Traveller",
  agentName: "Aarav Sharma",
  destination: "Bali",
  country: "Indonesia",
  travelStartDate: "2026-10-01",
  travelEndDate: "2026-10-05",
  nights: 4,
  days: 5,
  adults: 2,
  children: 1,
  infants: 0,
  currency: "INR",
  total: 12650,
  amount: 12650,
  gst: 0,
  taxRate: 0,
  validTill: "2026-09-20",
  paymentTerms: "50% advance to confirm.",
  cancellationPolicy: "As per supplier policy.",
  termsAndConditions: "Rates are subject to availability at confirmation.",
  travelDisclaimer: "Itinerary may change based on weather.",
  hotelTerms: "Quoted on twin sharing basis unless stated otherwise.",
  internalNotes: "SECRET INTERNAL NOTES",
  totalNetCost: 10000,
  trevioMarkupValue: 15,
  agentMarkup: 1150,
  packages: [
    {
      name: "Deluxe",
      sortOrder: 0,
      isSelected: true,
      pricing: {
        contractedCost: 10000,
        trevioMarkupAmount: 1500,
        trevioSellingPrice: 11500,
        agentMarkupAmount: 1150,
        customerPrice: 12650,
        taxAmount: null,
        taxRate: null,
        finalPrice: null,
        perAdultPrice: 5000,
        perChildPrice: 2650,
      },
      hotels: [{
        hotelName: "Ubud Garden",
        city: "Ubud",
        starCategory: "4",
        roomType: "Deluxe",
        mealPlan: "Breakfast",
        nights: 4,
        address: "Jl. Raya Ubud, Bali",
        highlight: "Walkable to central Ubud",
        costPrice: 5000,
        contractedCost: 5000,
        supplier: "Hidden DMC",
        remarks: "staff only remark",
      }],
      flights: [{
        airline: "Garuda",
        flightNo: "GA 851",
        from: "BLR",
        to: "DPS",
        date: "2026-10-01",
        depTime: "08:00",
        arrTime: "16:00",
        duration: "6h",
        cabin: "Economy",
        aircraft: "Boeing 737",
        sellingPrice: 8000,
        costPrice: 4000,
        direction: "outbound",
      }, {
        airline: "Garuda",
        flightNo: "GA 852",
        from: "DPS",
        to: "BLR",
        date: "2026-10-05",
        depTime: "18:00",
        arrTime: "21:30",
        duration: "5h 30m",
        cabin: "Economy",
        sellingPrice: 8000,
        direction: "return",
      }],
      transfers: [{ transferType: "Airport", vehicleType: "Innova", costPrice: 2000, supplier: "TransferCo" }],
      activities: [{ activityName: "Temple visit", description: "Morning temple circuit", costPrice: 800 }],
      meals: [{ mealType: "Dinner", restaurant: "Ubud Kitchen", date: "2026-10-02", sellingPrice: 1200 }],
      addOns: [{ name: "Local SIM", description: "7-day data", quantity: 2, sellingPrice: 900, currency: "INR", costPrice: 400 }],
      itinerary: [
        {
          day: 1,
          title: "Arrival",
          city: "Ubud",
          date: "2026-10-01",
          mealPlan: "Dinner",
          items: [
            { activityName: "Airport pickup", itemType: "TRANSFER" },
            { activityName: "Check-in", description: "Hotel check-in" },
          ],
        },
        {
          day: 2,
          title: "Temples",
          city: "Ubud",
          mealPlan: "Breakfast",
          items: [{ activityName: "Temple visit", description: "Tirta Empul" }],
        },
        {
          day: 3,
          title: "Leisure",
          city: "Ubud",
          mealPlan: "Breakfast",
          items: [],
        },
      ],
      inclusions: ["Accommodation with breakfast", "Airport transfers", "Temple entrance", "Welcome dinner"],
      exclusions: ["Personal expenses", "Tips", "Room service"],
    },
    {
      name: "Premium",
      sortOrder: 1,
      pricing: {
        customerPrice: 18000,
        taxAmount: null,
        finalPrice: null,
        perAdultPrice: 7000,
        perChildPrice: 4000,
      },
      hotels: [{ hotelName: "Seminyak Suites", city: "Seminyak", roomType: "Suite", mealPlan: "Breakfast", nights: 4 }],
      flights: [],
      transfers: [],
      activities: [],
      meals: [],
      itinerary: [{ day: 1, title: "Arrival Premium", items: [{ description: "Private transfer" }] }],
      inclusions: ["Accommodation"],
      exclusions: ["Personal expenses"],
    },
  ],
};

describe("phase 5 quotation pdf", () => {
  it("1-4. agent-facing model excludes contracted cost, trevio markup, and supplier", () => {
    const model = buildQuotationPdfModel({ quote: baseQuote, mode: "customer", audience: "agent" });
    const json = JSON.stringify(model);
    expect(json).not.toContain("10000");
    expect(json).not.toContain("1500");
    expect(json).not.toContain("Hidden DMC");
    expect(json).not.toContain("TransferCo");
    expect(json).not.toContain("contractedCost");
    expect(json).not.toContain("trevioMarkup");
    expect(assertCustomerSafeModel(model)).toEqual([]);
  });

  it("5-9. customer model excludes contracted cost, trevio markup, agent markup, notes, remarks", () => {
    const model = buildQuotationPdfModel({ quote: baseQuote, mode: "customer", audience: "customer" });
    const json = JSON.stringify(model);
    expect(json).not.toContain("1150");
    expect(json).not.toContain("agentMarkup");
    expect(json).not.toContain("SECRET INTERNAL NOTES");
    expect(json).not.toContain("staff only remark");
    expect(json).not.toContain("totalNetCost");
    expect(model.packages[0].pricing.packageBase).toBe(12650);
    expect(model.packages[0].pricing.perAdultPrice).toBe(5000);
    expect(assertCustomerSafeModel(model)).toEqual([]);
  });

  it("10. draft cannot produce a customer-shareable PDF that bypasses approval", () => {
    expect(quoteSendBlockReason({ status: "Draft", approvalStatus: "Draft", approvals: [] })).toMatch(/approval/i);
    expect(quoteSendBlockReason({
      status: "Pending Approval",
      approvalStatus: "Pending",
      approvals: [{ stage: "Team Lead", status: "Pending" }],
    })).toMatch(/approval/i);
  });

  it("11-12. rendered PDF is a private stored PDF and unauthorized visibility is blocked", async () => {
    const model = buildQuotationPdfModel({ quote: baseQuote, mode: "customer", audience: "customer" });
    expect(model.packages.map((p) => p.name)).toEqual(["Deluxe", "Premium"]);
    expect(assertCustomerSafeModel(model)).toEqual([]);
    const rendered = await renderQuotationPdf(model);
    expect(rendered.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(rendered.pageCount).toBeGreaterThan(2);
    expect(rendered.pageCount).toBeLessThan(30);
    expect(rendered.buffer.length).toBeGreaterThan(1000);
    const textish = rendered.buffer.toString("latin1");
    expect(textish).not.toMatch(/Hidden DMC/);
    expect(textish).not.toMatch(/SECRET INTERNAL NOTES/);
    expect(textish).not.toMatch(/staff only remark/);
    expect(textish).not.toMatch(/trevioMarkup/i);
    expect(textish).not.toMatch(/contractedCost/i);
    expect(model.agentName).toBe("Aarav Sharma");
    expect(model.destinationName).toBe("Bali");
    expect(model.packages[0].itinerary.length).toBeGreaterThan(0);
    expect(model.packages[0].hotels.length).toBeGreaterThan(0);

    const stored = await putPrivateObject(objectKey("quote-pdf-test", "quote.pdf"), rendered.buffer, "application/pdf");
    const again = await readPrivateObject(stored.storageKey);
    expect(again?.equals(rendered.buffer)).toBe(true);
    expect(visibilityAllows("travel_agent", "INTERNAL")).toBe(false);
    expect(visibilityAllows("customer", "CUSTOMER")).toBe(true);
  });

  it("visa/insurance customer notes do not trip the sensitive-field guard", () => {
    const quote = {
      ...baseQuote,
      packages: [{
        ...baseQuote.packages[0],
        visa: { enabled: true, visaType: "Tourist", remarks: "Carry originals" },
        insurance: { enabled: true, planName: "Travel Guard", remarks: "Covers medical" },
      }],
    };
    const model = buildQuotationPdfModel({ quote, mode: "customer", audience: "customer" });
    expect(model.packages[0].visa?.notes).toContain("Carry originals");
    expect(assertCustomerSafeModel(model)).toEqual([]);
  });

  it("multi-package pricing stays independent in the model", () => {
    const model = buildQuotationPdfModel({ quote: baseQuote, mode: "customer", audience: "customer" });
    expect(model.packages).toHaveLength(2);
    expect(model.packages[0].pricing.packageBase).toBe(12650);
    expect(model.packages[1].pricing.packageBase).toBe(18000);
    expect(model.packages[0].hotels[0].hotelName).toBe("Ubud Garden");
    expect(model.packages[1].hotels[0].hotelName).toBe("Seminyak Suites");
  });

  it("dedicated ADD-ONS section uses packages.addOns and hides legacy auto MISC itinerary lines", () => {
    const quote = {
      ...baseQuote,
      packages: [{
        ...baseQuote.packages[0],
        addOns: [{
          name: "Local SIM",
          description: "7-day data pack",
          date: "2026-10-02",
          city: "Ubud",
          quantity: 2,
          sellingPrice: 900,
          currency: "INR",
          costPrice: 400,
          supplier: "SecretSupplier",
        }],
        itinerary: [{
          day: 1,
          title: "Arrival",
          city: "Ubud",
          items: [
            { activityName: "Check-in", description: "Hotel check-in" },
            {
              activityName: "Local SIM",
              itemType: "MISC",
              autoFromMisc: true,
              miscLineId: "ao1",
            },
            {
              activityName: "Hand note",
              itemType: "MISC",
              description: "manual",
            },
          ],
        }],
      }],
    };
    const model = buildQuotationPdfModel({ quote, mode: "customer", audience: "customer" });
    const pkg = model.packages[0];
    expect(pkg.addOns).toHaveLength(1);
    expect(pkg.addOns[0].name).toBe("Local SIM");
    expect(pkg.addOns[0].description).toContain("7-day");
    expect(pkg.addOns[0].date).toBe("2026-10-02");
    expect(pkg.addOns[0].city).toBe("Ubud");
    expect(pkg.addOns[0].quantity).toBe(2);
    expect(pkg.addOns[0].sellingPrice).toBe(900);
    expect(pkg.addOns[0].unitPrice).toBe(450);
    expect(pkg.serviceTotals.some((r) => r.label === "Add-ons" && r.amount === 900)).toBe(true);
    const itineraryNames = pkg.itinerary[0].items.map((i) => i.activityName);
    expect(itineraryNames).toContain("Check-in");
    expect(itineraryNames).toContain("Hand note");
    expect(itineraryNames).not.toContain("Local SIM");
    expect(assertCustomerSafeModel(model)).toEqual([]);
    expect(JSON.stringify(model)).not.toMatch(/SecretSupplier|costPrice/i);
  });

  it("proposal model maps agent, destination copy, pax, hotel summary, and flight aircraft", () => {
    const model = buildQuotationPdfModel({
      quote: baseQuote,
      destinationDescription: "Bali blends temples, rice terraces, and coastal culture.",
      mode: "customer",
      audience: "customer",
    });
    expect(model.agentName).toBe("Aarav Sharma");
    expect(model.destinationName).toBe("Bali");
    expect(model.destinationDescription).toContain("temples");
    expect(model.paxSummary).toBe("2A+1C");
    expect(model.hotelSummary).toMatch(/UBUD GARDEN/);
    expect(model.packages[0].flights[0].aircraft).toBe("Boeing 737");
    expect(model.packages[0].hotels[0].highlight).toContain("Walkable");
    expect(model.flightCostPerPerson).toBe(8000);
    expect(model.packages[0].inclusionGroups.some((g) => g.label === "Hotel")).toBe(true);
    expect(model.overviewNotes.length).toBeGreaterThan(0);
  });

  it("omits land/flight per-person rows when flights have no selling prices", () => {
    const quote = {
      ...baseQuote,
      packages: [{
        ...baseQuote.packages[0],
        flights: [{ airline: "Garuda", from: "BLR", to: "DPS", date: "2026-10-01" }],
      }],
    };
    const model = buildQuotationPdfModel({ quote, mode: "customer", audience: "customer" });
    expect(model.flightCostPerPerson).toBeUndefined();
    expect(model.landCostPerPerson).toBeUndefined();
  });

  it("no-flight quotation still renders and skips empty airline page artifacts", async () => {
    const quote = {
      ...baseQuote,
      packages: [{
        ...baseQuote.packages[0],
        flights: [],
        hotels: [
          { hotelName: "Ubud Garden", nights: 2, starCategory: "4", mealPlan: "Breakfast" },
          { hotelName: "Seminyak Suites", nights: 2, starCategory: "5", mealPlan: "Breakfast", roomType: "Suite" },
        ],
      }],
    };
    const model = buildQuotationPdfModel({ quote, mode: "customer", audience: "customer" });
    expect(model.packages[0].flights).toHaveLength(0);
    expect(model.packages[0].hotels).toHaveLength(2);
    const rendered = await renderQuotationPdf(model);
    expect(rendered.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(rendered.pageCount).toBeGreaterThan(4);
    const textish = rendered.buffer.toString("latin1");
    expect(textish).not.toMatch(/Hidden DMC|contractedCost|supplier/i);
    expect(model.packages[0].hotels.map((h) => h.hotelName)).toEqual(["Ubud Garden", "Seminyak Suites"]);
    expect(model.packages[0].flights).toHaveLength(0);
  });

  it("missing images and long text do not break PDF generation", async () => {
    const long = "A".repeat(1200);
    const quote = {
      ...baseQuote,
      agentName: undefined,
      destinationDescription: long,
      packages: [{
        ...baseQuote.packages[0],
        hotels: [{
          hotelName: "Very Long Hotel Name ".repeat(8).trim(),
          address: long,
          highlight: long,
          imageUrl: "https://example.invalid/missing-hotel.jpg",
          nights: 4,
        }],
        itinerary: Array.from({ length: 8 }).map((_, i) => ({
          day: i + 1,
          title: `Day title ${i + 1} ${long.slice(0, 80)}`,
          coverImage: "https://example.invalid/missing-day.jpg",
          mealPlan: "Breakfast & Dinner",
          items: [
            { activityName: `Activity ${i + 1}`, description: long.slice(0, 200) },
            { activityName: `Transfer ${i + 1}`, itemType: "TRANSFER" },
          ],
        })),
        inclusions: Array.from({ length: 20 }).map((_, i) => `Inclusion item ${i + 1} ${long.slice(0, 40)}`),
        exclusions: Array.from({ length: 12 }).map((_, i) => `Exclusion item ${i + 1}`),
      }],
    };
    const model = buildQuotationPdfModel({
      quote,
      branding: { agencyName: "Trevio Global" },
      mode: "customer",
      audience: "customer",
    });
    expect(model.agentName).toBe("Trevio Global");
    expect(model.agentName).not.toMatch(/undefined/i);
    const rendered = await renderQuotationPdf(model);
    expect(rendered.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(rendered.pageCount).toBeGreaterThan(5);
  });

  it("writes a sample redesigned PDF artifact for visual QA", async () => {
    const model = buildQuotationPdfModel({
      quote: baseQuote,
      destinationDescription: "Bali is an island province of Indonesia known for its forested volcanic mountains, iconic rice paddies, beaches and coral reefs.",
      branding: {
        agencyName: "Trevio Global",
        phone: "+91 89516 63471",
        email: "hello@trevioglobal.com",
        footerText: "Trevio Global",
      },
      mode: "customer",
      audience: "customer",
    });
    const rendered = await renderQuotationPdf(model);
    const outDir = path.resolve(process.cwd(), "../phase5-artifacts");
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, "sample-redesigned-quotation-test.pdf");
    await writeFile(outPath, rendered.buffer);
    expect(rendered.pageCount).toBeGreaterThan(6);
    expect(assertCustomerSafeModel(model)).toEqual([]);
  });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
