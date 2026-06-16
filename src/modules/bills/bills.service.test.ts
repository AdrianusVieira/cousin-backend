import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/pool.js", () => ({ pool: {} }));
vi.mock("./bills.repository.js", () => ({
  findBillById: vi.fn(),
  deleteBillById: vi.fn(),
  createBill: vi.fn(),
  updateBill: vi.fn(),
  findAllBills: vi.fn(),
  findBillsByRecurrenceId: vi.fn(),
  findBillSummary: vi.fn(),
}));
vi.mock("../recurrences/recurrences.repository.js", () => ({
  createRecurrence: vi.fn(),
}));
vi.mock("../transactions/transactions.repository.js", () => ({
  findLinkedTransactionForBill: vi.fn(),
  findLinkedTransactionForRevenue: vi.fn(),
}));

import { deleteBillById, findBillById, updateBill } from "./bills.repository.js";
import { deleteBill, patchBill } from "./bills.service.js";
import type { BillWithMeta } from "./bills.types.js";

const fakeBill = (overrides: Partial<BillWithMeta> = {}): BillWithMeta => ({
  id: "bill-1",
  name: "Test Bill",
  description: null,
  value: "100.00",
  term: "2099-07-01",
  paid: false,
  source_id: "source-1",
  recurrence_id: null,
  has_linked_transaction: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteBill()", () => {
  describe("when the bill does not exist", () => {
    it("should throw NotFoundError", async () => {
      vi.mocked(findBillById).mockResolvedValueOnce(null);

      await expect(deleteBill("bill-1")).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    });
  });

  describe("when the bill is paid", () => {
    it("should throw ConflictError with DELETE_BLOCKED code", async () => {
      vi.mocked(findBillById).mockResolvedValueOnce(fakeBill({ paid: true }));

      await expect(deleteBill("bill-1")).rejects.toMatchObject({
        status: 409,
        code: "DELETE_BLOCKED",
      });
    });

    it("should not call deleteBillById", async () => {
      vi.mocked(findBillById).mockResolvedValueOnce(fakeBill({ paid: true }));

      await expect(deleteBill("bill-1")).rejects.toThrow();

      expect(vi.mocked(deleteBillById)).not.toHaveBeenCalled();
    });
  });

  describe("when the bill is unpaid", () => {
    it("should call deleteBillById with the bill id", async () => {
      vi.mocked(findBillById).mockResolvedValueOnce(fakeBill({ paid: false }));
      vi.mocked(deleteBillById).mockResolvedValueOnce(undefined);

      await deleteBill("bill-1");

      expect(vi.mocked(deleteBillById)).toHaveBeenCalledWith(expect.anything(), "bill-1");
    });
  });
});

describe("patchBill()", () => {
  describe("when the bill does not exist", () => {
    it("should throw NotFoundError", async () => {
      vi.mocked(findBillById).mockResolvedValueOnce(null);

      await expect(patchBill("bill-1", { name: "New name" })).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    });

    it("should not call updateBill", async () => {
      vi.mocked(findBillById).mockResolvedValueOnce(null);

      await expect(patchBill("bill-1", { name: "New name" })).rejects.toThrow();

      expect(vi.mocked(updateBill)).not.toHaveBeenCalled();
    });
  });
});
