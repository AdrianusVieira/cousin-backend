import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/pool.js", () => ({ pool: {} }));
vi.mock("./dashboard.repository.js", () => ({
  findDashboardRevenue: vi.fn(),
  findDashboardOutcome: vi.fn(),
  findCashFlow: vi.fn(),
  findPendingCreditSummary: vi.fn(),
  findPendingCreditPerWallet: vi.fn(),
}));

import {
  findCashFlow,
  findDashboardOutcome,
  findDashboardRevenue,
  findPendingCreditPerWallet,
  findPendingCreditSummary,
} from "./dashboard.repository.js";
import { getDashboard } from "./dashboard.service.js";

const FROM = "2026-01-01";
const TO = "2026-03-31";

function setupMocks({
  revenue = "0.00",
  outcome = "0.00",
  priorRevenue = "0.00",
  priorOutcome = "0.00",
  cashFlow = [] as { date: string; in: string; out: string }[],
} = {}) {
  vi.mocked(findDashboardRevenue)
    .mockResolvedValueOnce(revenue)
    .mockResolvedValueOnce(priorRevenue);
  vi.mocked(findDashboardOutcome)
    .mockResolvedValueOnce(outcome)
    .mockResolvedValueOnce(priorOutcome);
  vi.mocked(findCashFlow).mockResolvedValueOnce(cashFlow);
  vi.mocked(findPendingCreditSummary).mockResolvedValueOnce("0.00");
  vi.mocked(findPendingCreditPerWallet).mockResolvedValueOnce([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDashboard()", () => {
  describe("net", () => {
    it("should compute net as revenue minus outcome", async () => {
      setupMocks({ revenue: "1000.00", outcome: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.net).toBe("400.00");
    });

    it("should produce a negative net when outcome exceeds revenue", async () => {
      setupMocks({ revenue: "400.00", outcome: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.net).toBe("-200.00");
    });
  });

  describe("savingsRate", () => {
    it("should express net as a percentage of revenue", async () => {
      setupMocks({ revenue: "1000.00", outcome: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.savingsRate).toBe(40);
    });

    it("should return 0 when revenue is 0", async () => {
      setupMocks({ revenue: "0.00", outcome: "0.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.savingsRate).toBe(0);
    });
  });

  describe("prior period comparison", () => {
    it("should return null netDelta when prior period has no revenue and no outcome", async () => {
      setupMocks({ revenue: "1000.00", outcome: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.netDelta).toBeNull();
    });

    it("should return null savingsRateDelta when prior period has no data", async () => {
      setupMocks({ revenue: "1000.00", outcome: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.savingsRateDelta).toBeNull();
    });

    it("should return non-null netDelta when prior period has revenue", async () => {
      setupMocks({ revenue: "1000.00", outcome: "600.00", priorRevenue: "800.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.netDelta).not.toBeNull();
    });

    it("should return non-null netDelta when prior period has only outcome", async () => {
      setupMocks({ revenue: "1000.00", outcome: "600.00", priorOutcome: "500.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.netDelta).not.toBeNull();
    });

    it("should compute netDelta as current net minus prior net", async () => {
      // current net = 1000 - 600 = 400; prior net = 800 - 500 = 300; delta = 100
      setupMocks({
        revenue: "1000.00",
        outcome: "600.00",
        priorRevenue: "800.00",
        priorOutcome: "500.00",
      });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.netDelta).toBe("100.00");
    });
  });

  describe("cashFlow passthrough", () => {
    it("should include the cash flow series from the repository", async () => {
      const series = [
        { date: "2026-03-01", in: "500.00", out: "200.00" },
        { date: "2026-03-15", in: "0.00", out: "100.00" },
      ];
      setupMocks({ revenue: "500.00", cashFlow: series });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.cashFlow).toEqual(series);
    });
  });
});
