import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  isPastYmd,
  normalizeYmd,
  todayYmd,
  travelDatesBlockReason,
  travelDatesUpdateBlockReason,
} from "./travel-dates.js";

describe("travel-dates", () => {
  it("normalizes valid YYYY-MM-DD", () => {
    expect(normalizeYmd("2026-09-21")).toBe("2026-09-21");
    expect(normalizeYmd("not-a-date")).toBeNull();
  });

  it("blocks past travel start", () => {
    const today = todayYmd();
    const yesterday = addDaysYmd(today, -1);
    expect(isPastYmd(yesterday, today)).toBe(true);
    expect(travelDatesBlockReason({ travelStartDate: yesterday })).toMatch(/past/i);
  });

  it("allows today and future travel", () => {
    const today = todayYmd();
    expect(travelDatesBlockReason({ travelStartDate: today, travelEndDate: addDaysYmd(today, 1) })).toBeNull();
  });

  it("allows unchanged historical dates on update", () => {
    const today = todayYmd();
    const past = addDaysYmd(today, -10);
    expect(travelDatesUpdateBlockReason(
      { travelStartDate: past },
      { travelStartDate: past, travelEndDate: past },
    )).toBeNull();
  });

  it("blocks newly set past dates on update", () => {
    const today = todayYmd();
    const past = addDaysYmd(today, -1);
    expect(travelDatesUpdateBlockReason(
      { travelStartDate: past },
      { travelStartDate: addDaysYmd(today, 5) },
    )).toMatch(/past/i);
  });
});
