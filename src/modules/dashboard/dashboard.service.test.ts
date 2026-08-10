import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/pool.js", () => ({ pool: {} }));
vi.mock("./dashboard.repository.js", () => ({
  findCashFlow: vi.fn(),
  findInflowTransactions: vi.fn(),
  findOutflowTransactions: vi.fn(),
  findPendingCreditPerWallet: vi.fn(),
  findPendingCreditSummary: vi.fn(),
  findUnpaidBills: vi.fn(),
  findUnreceivedRevenues: vi.fn(),
}));

import {
  findCashFlow,
  findInflowTransactions,
  findOutflowTransactions,
  findPendingCreditPerWallet,
  findPendingCreditSummary,
  findUnpaidBills,
  findUnreceivedRevenues,
} from "./dashboard.repository.js";
import { getDashboard } from "./dashboard.service.js";

const FROM = "2026-01-01";
const TO = "2026-03-31";

function setupMocks({
  inflow = "0.00",
  inflowPendingCredit = "0.00",
  outflow = "0.00",
  outflowPendingCredit = "0.00",
  unpaidBills = "0.00",
  unreceivedRevenues = "0.00",
  cashFlow = [] as { date: string; in: string; out: string }[],
} = {}) {
  vi.mocked(findInflowTransactions).mockResolvedValueOnce({
    pending_credit: inflowPendingCredit,
    settled_total: inflow,
  });
  vi.mocked(findOutflowTransactions).mockResolvedValueOnce({
    pending_credit: outflowPendingCredit,
    settled_total: outflow,
  });
  vi.mocked(findUnpaidBills).mockResolvedValueOnce(unpaidBills);
  vi.mocked(findUnreceivedRevenues).mockResolvedValueOnce(unreceivedRevenues);
  vi.mocked(findCashFlow).mockResolvedValueOnce(cashFlow);
  vi.mocked(findPendingCreditSummary).mockResolvedValueOnce("0.00");
  vi.mocked(findPendingCreditPerWallet).mockResolvedValueOnce([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDashboard()", () => {
  describe("income", () => {
    it("should total inflow transactions plus unreceived revenues", async () => {
      setupMocks({ inflow: "800.00", unreceivedRevenues: "200.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.income).toEqual({
        pendingCredit: "0.00",
        settled: "800.00",
        total: "1000.00",
        unreceived: "200.00",
      });
    });

    it("should count pending credit inflow toward the total but keep it separate", async () => {
      setupMocks({ inflow: "800.00", inflowPendingCredit: "120.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.income).toEqual({
        pendingCredit: "120.00",
        settled: "800.00",
        total: "920.00",
        unreceived: "0.00",
      });
    });
  });

  describe("outcome", () => {
    it("should total outflow transactions plus unpaid bills", async () => {
      setupMocks({ outflow: "450.00", unpaidBills: "150.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.outcome).toEqual({
        pendingCredit: "0.00",
        settled: "450.00",
        total: "600.00",
        unpaid: "150.00",
      });
    });

    it("should count pending credit outflow toward the total but keep it separate", async () => {
      setupMocks({ outflow: "450.00", outflowPendingCredit: "250.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.outcome).toEqual({
        pendingCredit: "250.00",
        settled: "450.00",
        total: "700.00",
        unpaid: "0.00",
      });
    });
  });

  describe("net", () => {
    it("should compute net as income total minus outcome total", async () => {
      setupMocks({
        inflow: "800.00",
        outflow: "450.00",
        unpaidBills: "150.00",
        unreceivedRevenues: "200.00",
      });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.net).toBe("400.00");
    });

    it("should produce a negative net when outcome exceeds income", async () => {
      setupMocks({ inflow: "400.00", outflow: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.net).toBe("-200.00");
    });
  });

  describe("savingsRate", () => {
    it("should express net as a percentage of income", async () => {
      setupMocks({ inflow: "1000.00", outflow: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.savingsRate).toBe(40);
    });

    it("should include unpaid bills and unreceived revenues in the rate", async () => {
      // income = 800 + 200 = 1000; outcome = 450 + 150 = 600; rate = 40%
      setupMocks({
        inflow: "800.00",
        outflow: "450.00",
        unpaidBills: "150.00",
        unreceivedRevenues: "200.00",
      });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.savingsRate).toBe(40);
    });

    it("should return 0 when income is 0", async () => {
      setupMocks({ outflow: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.savingsRate).toBe(0);
    });

    it("should be negative when outcome exceeds income", async () => {
      setupMocks({ inflow: "400.00", outflow: "600.00" });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.savingsRate).toBe(-50);
    });
  });

  describe("cashFlow passthrough", () => {
    it("should include the cash flow series from the repository", async () => {
      const series = [
        { date: "2026-03-01", in: "500.00", out: "200.00" },
        { date: "2026-03-15", in: "0.00", out: "100.00" },
      ];
      setupMocks({ inflow: "500.00", cashFlow: series });

      const result = await getDashboard({ from: FROM, to: TO });

      expect(result.cashFlow).toEqual(series);
    });
  });
});
