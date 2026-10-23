import { describe, expect, it, vi } from "vitest";
vi.mock("../../db/pool.js", () => ({ pool: {} }));
import { buildForecast } from "./forecast.service.js";

describe("scheduled cash forecast", () => {
  it("includes overdue commitments today and reports the first shortfall", () => {
    const result = buildForecast(
      "100.00",
      [
        { id: "bill", type: "bill", label: "Rent", amount: "150.00", date: "2026-10-20" },
        { id: "income", type: "revenue", label: "Salary", amount: "500.00", date: "2026-10-23" },
      ],
      "2026-10-22",
      30,
    );
    expect(result.firstNegativeDate).toBe("2026-10-22");
    expect(result.lowestBalance).toBe("-50.00");
    expect(result.closingBalance).toBe("450.00");
    expect(result.events[0]?.overdue).toBe(true);
  });
  it("excludes events beyond the selected horizon and keeps cents exact", () => {
    const result = buildForecast(
      "0.30",
      [
        { id: "bill", type: "bill", label: "Small", amount: "0.10", date: "2026-10-23" },
        { id: "later", type: "credit", label: "Later", amount: "100.00", date: "2027-01-01" },
      ],
      "2026-10-22",
      30,
    );
    expect(result.closingBalance).toBe("0.20");
    expect(result.events).toHaveLength(1);
  });
});
