import { describe, expect, it } from "vitest";
import {
  seedTravelDetailsFromPackage,
  seedTravelDetailsFromServices,
  travelDetailsComplete,
} from "./travel-details";

describe("travel-details seeding", () => {
  it("seeds flights and hotel from quotation package lines", () => {
    const td = seedTravelDetailsFromPackage({
      flights: [
        {
          airline: "AirAsia",
          flightNumber: "AK123",
          from: "HYD",
          to: "LGK",
          date: "2026-10-01",
          depTime: "09:30",
          pnr: "ABC123",
        },
      ],
      hotels: [
        {
          hotelName: "Bayview Langkawi",
          checkIn: "2026-10-01",
          checkOut: "2026-10-03",
          roomType: "Deluxe",
          mealPlan: "Breakfast",
        },
      ],
    });
    expect(td.flights?.[0]).toMatchObject({
      airline: "AirAsia",
      flightNumber: "AK123",
      from: "HYD",
      to: "LGK",
      date: "2026-10-01",
      time: "09:30",
      pnr: "ABC123",
    });
    expect(td.hotel).toMatchObject({
      name: "Bayview Langkawi",
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      roomCategory: "Deluxe",
      mealPlan: "Breakfast",
    });
  });

  it("parses flight/hotel notes when only BookingService rows exist", () => {
    const td = seedTravelDetailsFromServices([
      {
        serviceType: "Flight",
        title: "AirAsia AK123",
        confirmationNo: "XYZ9",
        notes: "HYD → LGK · Dep 2026-10-01 · 09:30–14:00 · PNR: XYZ9",
      },
      {
        serviceType: "Hotel",
        title: "Bayview Langkawi",
        notes: "4* · Deluxe · Breakfast · Langkawi · 2026-10-01 → 2026-10-03 · 2 nights",
      },
    ]);
    expect(td.flights?.[0]).toMatchObject({
      from: "HYD",
      to: "LGK",
      date: "2026-10-01",
      time: "09:30",
      pnr: "XYZ9",
    });
    expect(td.hotel).toMatchObject({
      name: "Bayview Langkawi",
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
    });
  });

  it("does not require flight details when there are no Flight services (land-only)", () => {
    const check = travelDetailsComplete(
      { flights: [], hotel: { name: "Bayview Langkawi" } },
      [{ serviceType: "Hotel", status: "Pending", title: "Bayview Langkawi" }],
    );
    expect(check.ok).toBe(true);
    expect(check.missing).toEqual([]);
  });

  it("requires flight from/to/date when Flight services exist", () => {
    const check = travelDetailsComplete(
      { flights: [{ airline: "AK" }], hotel: { name: "Hotel" } },
      [
        { serviceType: "Flight", status: "Pending", title: "AK 1" },
        { serviceType: "Hotel", status: "Pending", title: "Hotel" },
      ],
    );
    expect(check.ok).toBe(false);
    expect(check.missing).toContain("flight details (from, to, date)");
  });
});
