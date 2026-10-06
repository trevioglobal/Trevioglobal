import { describe, expect, it } from "vitest";
import {
  airportPickupSearchQuery,
  bindAirportTransfersToSelectedHotels,
  estimateCustomerInrPrice,
  filterVehiclesForAirportPax,
  formatTransferDestination,
  getTransferVehicleOptions,
  hotelsForAirportPickupDay,
  isAirportGuideMandatory,
  isMalaysiaHotelCatalogueCity,
  matchesAirportPickupForDayCity,
  matchesMalaysiaKlAirportTransferList,
  normalizeMalaysiaHotelCity,
  requiredVehicleBandForPax,
  transferMatchesDayCity,
  validateAirportVehicleForPax,
} from "./transfer-catalog";

const SAMPLE_VEHICLES = {
  vehiclePricing: [
    { vehicleType: "Sedan / Car", seats: 3, price: 2375 },
    { vehicleType: "Van 10-seater", seats: 6, price: 3230 },
    { vehicleType: "Van 18-seater", seats: 13, price: 4465 },
    { vehicleType: "Van 18-seater + Guide", seats: 13, price: 10165 },
  ],
};

describe("Malaysia airport vehicle ↔ pax rules", () => {
  it("maps pax bands", () => {
    expect(requiredVehicleBandForPax(1)).toBe("car");
    expect(requiredVehicleBandForPax(3)).toBe("car");
    expect(requiredVehicleBandForPax(5)).toBe("van10");
    expect(requiredVehicleBandForPax(7)).toBe("van18");
    expect(requiredVehicleBandForPax(8)).toBe("van18Guide");
    expect(requiredVehicleBandForPax(13)).toBe("van18Guide");
    expect(requiredVehicleBandForPax(14)).toBe("over_capacity");
  });

  it("guide mandatory only for 8–13", () => {
    expect(isAirportGuideMandatory(7)).toBe(false);
    expect(isAirportGuideMandatory(8)).toBe(true);
    expect(isAirportGuideMandatory(13)).toBe(true);
  });

  it("allows any vehicle selection; band filter remains advisory", () => {
    const opts = getTransferVehicleOptions(SAMPLE_VEHICLES);
    expect(filterVehiclesForAirportPax(opts, 3).map((v) => v.label)).toEqual(["CAR"]);
    expect(filterVehiclesForAirportPax(opts, 5).map((v) => v.label)).toEqual(["10-SEATER"]);
    expect(filterVehiclesForAirportPax(opts, 7).map((v) => v.label)).toEqual(["18-SEATER"]);
    expect(filterVehiclesForAirportPax(opts, 10).map((v) => v.label)).toEqual(["18 SEATER + GUIDE"]);
    expect(filterVehiclesForAirportPax(opts, 14)).toEqual([]);
    // Full sheet always exposes all 4 columns.
    expect(opts.map((v) => v.label)).toEqual([
      "CAR",
      "10-SEATER",
      "18-SEATER",
      "18 SEATER + GUIDE",
    ]);
    expect(opts.map((v) => v.paxLabel)).toEqual([
      "1-3 Pax",
      "4-6 Pax",
      "7-13 Pax",
      "7-13 Pax",
    ]);
  });

  it("does not hard-block vehicle/pax combinations", () => {
    expect(validateAirportVehicleForPax("Sedan / Car", 5).ok).toBe(true);
    expect(validateAirportVehicleForPax("Van 18-seater", 5).ok).toBe(true);
    expect(validateAirportVehicleForPax("Van 18-seater", 7).ok).toBe(true);
    expect(validateAirportVehicleForPax("Van 18-seater + Guide", 8).ok).toBe(true);
    expect(validateAirportVehicleForPax("Van 18-seater", 8).ok).toBe(true);
    expect(validateAirportVehicleForPax("Van 18-seater + Guide", 14).ok).toBe(true);
    expect(validateAirportVehicleForPax("", 3).ok).toBe(false);
  });

  it("estimates customer INR with markup", () => {
    expect(estimateCustomerInrPrice(1000, { type: "Percentage", value: 0 })).toBe(1000);
    expect(estimateCustomerInrPrice(1000, { type: "Percentage", value: 10 })).toBe(1100);
    expect(estimateCustomerInrPrice(1000, { type: "Fixed", value: 200 })).toBe(1200);
  });
});

describe("Malaysia hotel city catalogue", () => {
  it("recognises only KL / Genting / Langkawi", () => {
    expect(isMalaysiaHotelCatalogueCity("Kuala Lumpur")).toBe(true);
    expect(isMalaysiaHotelCatalogueCity("Genting Highlands")).toBe(true);
    expect(isMalaysiaHotelCatalogueCity("Langkawi")).toBe(true);
    expect(isMalaysiaHotelCatalogueCity("Malacca")).toBe(false);
    expect(isMalaysiaHotelCatalogueCity("Penang")).toBe(false);
  });

  it("normalises Genting aliases", () => {
    expect(normalizeMalaysiaHotelCity("Genting")).toBe("Genting Highlands");
    expect(normalizeMalaysiaHotelCity("Kuala Lumpur")).toBe("Kuala Lumpur");
  });
});

describe("KL Airport transfer destinations", () => {
  it("shows full DESTINATION titles instead of Airport → short labels", () => {
    const name = "One Way Transfer from Kuala Lumpur Airport - Port Dickson Hotel";
    expect(formatTransferDestination({ name })).toBe(name);
    expect(formatTransferDestination({
      name: "One Way Transfer from Kuala Lumpur Hotel - Kuala Lumpur Airport + Enroute Putrajaya ( 30Mins )",
    })).toBe("One Way Transfer from Kuala Lumpur Hotel - Kuala Lumpur Airport + Enroute Putrajaya (30Mins)");
  });

  it("matches curated Airport → Hotel destinations and rejects reverse", () => {
    expect(matchesMalaysiaKlAirportTransferList({
      name: "One Way Transfer from Kuala Lumpur Airport - Singapore Hotel",
      pickupLocation: "Kuala Lumpur Airport",
      dropLocation: "Singapore Hotel",
    })).toBe(true);
    expect(matchesMalaysiaKlAirportTransferList({
      name: "One Way Transfer from Kuala Lumpur Airport - Genting Hotel + Enrote Batu Caves ( 30Mins )",
      pickupLocation: "Kuala Lumpur Airport",
      dropLocation: "Genting Hotel",
    })).toBe(true);
    expect(matchesMalaysiaKlAirportTransferList({
      name: "One Way Transfer from Singapore Hotel - Kuala Lumpur Airport",
      pickupLocation: "Singapore Hotel",
      dropLocation: "Kuala Lumpur Airport",
    })).toBe(false);
  });

  it("binds booked hotel names onto Airport → Hotel transfer rows", () => {
    const products = [
      {
        id: "xfer-kl-day",
        name: "One Way Transfer from Kuala Lumpur Airport - Kuala Lumpur Hotel ( 6am - 11pm )",
        pickupLocation: "Kuala Lumpur Airport",
        dropLocation: "Kuala Lumpur Hotel",
      },
      {
        id: "xfer-sg",
        name: "One Way Transfer from Kuala Lumpur Airport - Singapore Hotel",
        pickupLocation: "Kuala Lumpur Airport",
        dropLocation: "Singapore Hotel",
      },
    ];
    const bound = bindAirportTransfersToSelectedHotels(products, [
      { lineId: "h1", hotelName: "Ramada Encore", tripCity: "Kuala Lumpur" },
    ]);
    expect(bound[0]?.name).toBe("One Way Transfer from Kuala Lumpur Airport - Ramada Encore");
    expect(bound[0]?.dropLocation).toBe("Ramada Encore");
    expect(bound[0]?.boundHotelName).toBe("Ramada Encore");
    // Generic KL Hotel row replaced; Singapore outstation kept.
    expect(bound.some((p) => String(p.name).includes("Kuala Lumpur Hotel ("))).toBe(false);
    expect(bound.some((p) => String(p.name).includes("Singapore Hotel"))).toBe(true);
  });
});

describe("Multi-city day airport / transfer scoping", () => {
  it("maps airport search query by day city", () => {
    expect(airportPickupSearchQuery("Langkawi")).toBe("Langkawi Airport");
    expect(airportPickupSearchQuery("Genting Highlands")).toBe("Kuala Lumpur Airport");
    expect(airportPickupSearchQuery("Kuala Lumpur")).toBe("Kuala Lumpur Airport");
  });

  it("scopes airport pickup to Langkawi / Genting / KL", () => {
    const langkawi = {
      name: "One Way Transfer from Langkawi Airport - Langkawi Hotel",
      pickupLocation: "Langkawi Airport",
      dropLocation: "Langkawi Hotel",
    };
    const genting = {
      name: "One Way Transfer from Kuala Lumpur Airport - Genting Hotel",
      pickupLocation: "Kuala Lumpur Airport",
      dropLocation: "Genting Hotel",
    };
    const kl = {
      name: "One Way Transfer from Kuala Lumpur Airport - Kuala Lumpur Hotel ( 6am - 11pm )",
      pickupLocation: "Kuala Lumpur Airport",
      dropLocation: "Kuala Lumpur Hotel",
    };

    expect(matchesAirportPickupForDayCity(langkawi, "Langkawi")).toBe(true);
    expect(matchesAirportPickupForDayCity(genting, "Langkawi")).toBe(false);
    expect(matchesAirportPickupForDayCity(genting, "Genting Highlands")).toBe(true);
    expect(matchesAirportPickupForDayCity(kl, "Genting Highlands")).toBe(false);
    expect(matchesAirportPickupForDayCity(kl, "Kuala Lumpur")).toBe(true);
  });

  it("filters regular transfers for Genting days", () => {
    expect(transferMatchesDayCity({
      name: "One Way Transfer from Kuala Lumpur Hotel - Genting Hotel",
      city: "Kuala Lumpur",
    }, "Genting Highlands")).toBe(true);
    expect(transferMatchesDayCity({
      name: "One Way Transfer from Kuala Lumpur Hotel - Malacca Hotel",
      city: "Kuala Lumpur",
    }, "Genting Highlands")).toBe(false);
    expect(transferMatchesDayCity({
      name: "Langkawi Hotel - Langkawi Airport",
      city: "Langkawi",
    }, "Langkawi")).toBe(true);
  });

  it("binds only hotels covering the day / city", () => {
    const hotels = [
      {
        lineId: "h-kl",
        hotelName: "Ramada Encore",
        tripCity: "Kuala Lumpur",
        checkIn: "2026-06-01",
        checkOut: "2026-06-03",
      },
      {
        lineId: "h-lgk",
        hotelName: "The Datai",
        tripCity: "Langkawi",
        checkIn: "2026-06-03",
        checkOut: "2026-06-05",
      },
    ];
    expect(hotelsForAirportPickupDay(hotels, {
      serviceDate: "2026-06-03",
      dayCity: "Langkawi",
    }).map((h) => h.hotelName)).toEqual(["The Datai"]);
    expect(hotelsForAirportPickupDay(hotels, {
      serviceDate: "2026-06-01",
      dayCity: "Kuala Lumpur",
    }).map((h) => h.hotelName)).toEqual(["Ramada Encore"]);
    expect(hotelsForAirportPickupDay(hotels, {
      dayCity: "Genting Highlands",
    })).toEqual([]);
  });

  it("does not bind KL hotel onto Langkawi airport products", () => {
    const products = [
      {
        id: "xfer-lgk",
        name: "One Way Transfer from Langkawi Airport - Langkawi Hotel",
        pickupLocation: "Langkawi Airport",
        dropLocation: "Langkawi Hotel",
      },
      {
        id: "xfer-kl",
        name: "One Way Transfer from Kuala Lumpur Airport - Kuala Lumpur Hotel ( 6am - 11pm )",
        pickupLocation: "Kuala Lumpur Airport",
        dropLocation: "Kuala Lumpur Hotel",
      },
    ];
    const dayHotels = hotelsForAirportPickupDay(
      [{ lineId: "h1", hotelName: "The Datai", tripCity: "Langkawi", checkIn: "2026-06-03", checkOut: "2026-06-05" }],
      { serviceDate: "2026-06-03", dayCity: "Langkawi" },
    );
    const bound = bindAirportTransfersToSelectedHotels(products, dayHotels);
    expect(bound[0]?.boundHotelName).toBe("The Datai");
    expect(String(bound[0]?.name)).toContain("Langkawi Airport");
    expect(String(bound[0]?.name)).toContain("The Datai");
    expect(bound.some((p) => String(p.boundHotelName) === "Ramada Encore")).toBe(false);
  });
});
