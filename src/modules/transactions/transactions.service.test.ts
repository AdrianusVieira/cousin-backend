import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/pool.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

import { pool } from "../../db/pool.js";
import { patchTransactionSchema } from "./transactions.schema.js";
import { patchTransaction } from "./transactions.service.js";
import type { FullTransactionRow } from "./transactions.types.js";

const row: FullTransactionRow = {
  id: "txn-1",
  amount: "12.34",
  date: "2026-10-01",
  description: "Lunch",
  method: "debit",
  category_allocations: [
    { categoryId: "11111111-1111-4111-8111-111111111111", categoryName: "Food", amount: "12.34" },
  ],
  from_type: "wallet",
  from_id: "wallet-1",
  from_name: "Test wallet",
  to_type: "external",
  to_id: null,
  to_name: null,
  installment_number: null,
  installment_total: null,
  credit_group_id: null,
  settled: true,
  settled_at: null,
  term: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(pool.connect).mockResolvedValue({ query: pool.query, release: vi.fn() } as never);
  vi.mocked(pool.query).mockResolvedValue({ rows: [row] } as never);
});

describe("patchTransaction", () => {
  it.each(["debit", "credit"] as const)(
    "should preserve description and category when only the date changes on %s",
    async (method) => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [{ ...row, method }] } as never);
      await patchTransaction(row.id, patchTransactionSchema.parse({ date: "2026-10-02" }));

      expect(pool.query).toHaveBeenCalledWith("update transactions set date = $1 where id = $2", [
        "2026-10-02",
        row.id,
      ]);
    },
  );

  it("should still allow explicitly clearing the description", async () => {
    await patchTransaction(row.id, patchTransactionSchema.parse({ description: null }));

    expect(pool.query).toHaveBeenCalledWith(
      "update transactions set description = $1 where id = $2",
      [null, row.id],
    );
  });

  it("should still allow explicitly clearing the category without clearing the description", async () => {
    await patchTransaction(row.id, patchTransactionSchema.parse({ categoryId: null }));

    expect(pool.query).toHaveBeenCalledWith(
      "delete from transaction_category_allocations where transaction_id = $1",
      [row.id],
    );
  });

  it("should update the description without clearing the category", async () => {
    await patchTransaction(row.id, patchTransactionSchema.parse({ description: "Dinner" }));

    expect(pool.query).toHaveBeenCalledWith(
      "update transactions set description = $1 where id = $2",
      ["Dinner", row.id],
    );
  });

  it("should reject changing a split total without balanced replacement allocations before changing balances", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          ...row,
          category_allocations: [
            { categoryId: "category-1", categoryName: "Food", amount: "10.00" },
            { categoryId: "category-2", categoryName: "Home", amount: "2.34" },
          ],
        },
      ],
    } as never);
    await expect(patchTransaction(row.id, { amount: "20.00" })).rejects.toThrow(
      "Validation failed",
    );
    expect(
      vi.mocked(pool.query).mock.calls.some(([sql]) => String(sql).includes("update wallets")),
    ).toBe(false);
    expect(pool.query).toHaveBeenCalledWith("rollback");
  });
});
