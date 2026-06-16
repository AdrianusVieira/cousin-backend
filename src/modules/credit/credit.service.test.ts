import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/pool.js", () => ({ pool: {} }));
vi.mock("./credit.repository.js", () => ({
  findCreditTransactions: vi.fn(),
}));
vi.mock("../transactions/transactions.repository.js", () => ({
  findTransactionsByIds: vi.fn(),
  setTransactionsSettled: vi.fn(),
}));

import { findCreditTransactions } from "./credit.repository.js";
import { listCredit } from "./credit.service.js";
import type { FullTransactionRow } from "../transactions/transactions.types.js";

const FROM = "2026-01-01";
const TO = "2026-03-31";

const makeCreditRow = (overrides: Partial<FullTransactionRow> = {}): FullTransactionRow => ({
  id: "txn-1",
  amount: "100.00",
  date: "2026-03-01",
  description: null,
  method: "credit",
  category_id: null,
  category_name: null,
  from_type: "wallet",
  from_id: "wallet-1",
  from_name: "Test Wallet",
  to_type: "external",
  to_id: null,
  to_name: null,
  installment_number: null,
  installment_total: null,
  credit_group_id: null,
  settled: false,
  term: "2026-03-15",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCredit()", () => {
  describe("grouping by wallet + term", () => {
    it("should combine transactions with the same wallet and term into one group", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1" }),
        makeCreditRow({ id: "txn-2" }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.groups).toHaveLength(1);
    });

    it("should place transactions with different wallet ids into separate groups", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", from_id: "wallet-1", from_name: "Wallet A" }),
        makeCreditRow({ id: "txn-2", from_id: "wallet-2", from_name: "Wallet B" }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.groups).toHaveLength(2);
    });

    it("should place transactions with different terms into separate groups", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", term: "2026-02-15" }),
        makeCreditRow({ id: "txn-2", term: "2026-03-15" }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.groups).toHaveLength(2);
    });

    it("should expose the walletId and term on each group", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ from_id: "wallet-1", from_name: "My Wallet", term: "2026-03-15" }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.groups[0]).toMatchObject({
        walletId: "wallet-1",
        walletName: "My Wallet",
        term: "2026-03-15",
      });
    });
  });

  describe("settled flag", () => {
    it("should mark a group as settled when every transaction in it is settled", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", settled: true }),
        makeCreditRow({ id: "txn-2", settled: true }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.groups[0]?.settled).toBe(true);
    });

    it("should mark a group as unsettled when any transaction in it is not settled", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", settled: true }),
        makeCreditRow({ id: "txn-2", settled: false }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.groups[0]?.settled).toBe(false);
    });
  });

  describe("summary", () => {
    it("should count only unsettled groups as openStatements", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", from_id: "wallet-1", settled: false }),
        makeCreditRow({ id: "txn-2", from_id: "wallet-2", from_name: "Wallet B", settled: true }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.summary.openStatements).toBe(1);
    });

    it("should sum only unsettled group totals in pendingCredit", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", from_id: "wallet-1", amount: "200.00", settled: false }),
        makeCreditRow({ id: "txn-2", from_id: "wallet-2", from_name: "Wallet B", amount: "300.00", settled: true }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.summary.pendingCredit).toBe("200.00");
    });

    it("should sum only settled group totals in settledInPeriod", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", from_id: "wallet-1", amount: "200.00", settled: false }),
        makeCreditRow({ id: "txn-2", from_id: "wallet-2", from_name: "Wallet B", amount: "300.00", settled: true }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.summary.settledInPeriod).toBe("300.00");
    });

    it("should sum all transactions in a group into its total", async () => {
      vi.mocked(findCreditTransactions).mockResolvedValueOnce([
        makeCreditRow({ id: "txn-1", amount: "100.00", settled: false }),
        makeCreditRow({ id: "txn-2", amount: "50.00", settled: false }),
      ]);

      const result = await listCredit({ from: FROM, to: TO });

      expect(result.groups[0]?.total).toBe("150.00");
    });
  });
});
