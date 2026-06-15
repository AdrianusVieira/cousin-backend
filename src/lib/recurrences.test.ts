import { describe, expect, it } from "vitest";
import { computeNextTerm, lookaheadCount } from "./recurrences.js";

describe("lookaheadCount", () => {
  it("returns 3 for sub-yearly intervals", () => {
    expect(lookaheadCount("day")).toBe(3);
    expect(lookaheadCount("week")).toBe(3);
    expect(lookaheadCount("month")).toBe(3);
  });

  it("returns 1 for year interval", () => {
    expect(lookaheadCount("year")).toBe(1);
  });
});

describe("computeNextTerm", () => {
  it("adds days", () => {
    expect(computeNextTerm("2026-06-15", { intervalUnit: "day", intervalValue: 7, recurrentDay: 15 })).toBe(
      "2026-06-22",
    );
  });

  it("adds weeks", () => {
    expect(computeNextTerm("2026-06-15", { intervalUnit: "week", intervalValue: 2, recurrentDay: 15 })).toBe(
      "2026-06-29",
    );
  });

  it("adds months using recurrentDay", () => {
    expect(
      computeNextTerm("2026-06-15", { intervalUnit: "month", intervalValue: 1, recurrentDay: 20 }),
    ).toBe("2026-07-20");
  });

  it("clamps recurrentDay to month length", () => {
    expect(
      computeNextTerm("2026-01-31", { intervalUnit: "month", intervalValue: 1, recurrentDay: 31 }),
    ).toBe("2026-02-28");
  });

  it("rolls over year boundary correctly", () => {
    expect(
      computeNextTerm("2026-11-30", { intervalUnit: "month", intervalValue: 1, recurrentDay: 30 }),
    ).toBe("2026-12-30");
    expect(
      computeNextTerm("2026-12-31", { intervalUnit: "month", intervalValue: 1, recurrentDay: 31 }),
    ).toBe("2027-01-31");
  });

  it("adds years with recurrentMonth and recurrentDay", () => {
    expect(
      computeNextTerm("2026-01-31", {
        intervalUnit: "year",
        intervalValue: 1,
        recurrentDay: 31,
        recurrentMonth: 3,
      }),
    ).toBe("2027-03-31");
  });

  it("clamps recurrentDay for yearly leap year edge case", () => {
    expect(
      computeNextTerm("2024-02-29", {
        intervalUnit: "year",
        intervalValue: 1,
        recurrentDay: 29,
        recurrentMonth: 2,
      }),
    ).toBe("2025-02-28");
  });
});
