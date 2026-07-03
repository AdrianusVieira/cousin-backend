import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = { query: vi.fn(), release: vi.fn() };

vi.mock("../../db/pool.js", () => ({ pool: { connect: vi.fn() } }));
vi.mock("../wallets/wallets.repository.js", () => ({ findWalletById: vi.fn() }));
vi.mock("../transactions/transactions.repository.js", () => ({
  findTransactionsByIds: vi.fn(),
  insertTransaction: vi.fn(),
}));
vi.mock("./imports.repository.js", () => ({
  findExistingCreditGroupId: vi.fn(),
  findExistingCreditTxnKeys: vi.fn(),
}));

import { pool } from "../../db/pool.js";
import { findWalletById } from "../wallets/wallets.repository.js";
import { findTransactionsByIds, insertTransaction } from "../transactions/transactions.repository.js";
import { findExistingCreditGroupId, findExistingCreditTxnKeys } from "./imports.repository.js";
import { importTransactions } from "./imports.service.js";
import type { ImportTransactionsInput } from "./imports.schema.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WALLET_ID = "11111111-1111-4111-8111-111111111111";

const baseInput = (rows: ImportTransactionsInput["rows"]): ImportTransactionsInput => ({
  rows,
  walletId: WALLET_ID,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.connect).mockResolvedValue(mockClient as never);
  vi.mocked(findWalletById).mockResolvedValue({ id: WALLET_ID } as never);
  vi.mocked(findExistingCreditTxnKeys).mockResolvedValue([]);
  vi.mocked(findExistingCreditGroupId).mockResolvedValue(null);
  vi.mocked(insertTransaction).mockResolvedValue("txn-id");
  vi.mocked(findTransactionsByIds).mockResolvedValue([]);
});

describe("importTransactions()", () => {
  it("throws NotFoundError when the wallet doesn't resolve", async () => {
    vi.mocked(findWalletById).mockResolvedValue(null);

    await expect(
      importTransactions(baseInput([{ amount: "10.00", date: "2026-07-01" }])),
    ).rejects.toThrow("Wallet not found");
  });

  it("skips a negative-amount row without inserting it", async () => {
    const result = await importTransactions(
      baseInput([{ amount: "-42.00", date: "2026-07-01", description: "Payment" }]),
    );

    expect(insertTransaction).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([
      { amount: "-42.00", date: "2026-07-01", description: "Payment", index: 0, reason: "negativeAmount" },
    ]);
    expect(result.summary).toEqual({ importedCount: 0, skippedCount: 1, totalRows: 1 });
  });

  it("skips a row matching an existing DB transaction", async () => {
    vi.mocked(findExistingCreditTxnKeys).mockResolvedValue([
      { amount: "10.00", date: "2026-07-01", description: "Uber" },
    ]);

    const result = await importTransactions(
      baseInput([{ amount: "10.00", date: "2026-07-01", description: "Uber" }]),
    );

    expect(insertTransaction).not.toHaveBeenCalled();
    expect(result.skipped[0]).toMatchObject({ reason: "duplicate" });
  });

  it("skips a second identical row within the same batch", async () => {
    const row = { amount: "10.00", date: "2026-07-01", description: "Uber" };

    const result = await importTransactions(baseInput([row, { ...row }]));

    expect(insertTransaction).toHaveBeenCalledTimes(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ index: 1, reason: "duplicate" });
  });

  it("reuses an existing credit_group_id for an installment row", async () => {
    vi.mocked(findExistingCreditGroupId).mockResolvedValue("existing-group-id");

    await importTransactions(
      baseInput([
        { amount: "10.00", date: "2026-07-01", description: "Amazon", installmentNumber: 3, installmentTotal: 6 },
      ]),
    );

    expect(findExistingCreditGroupId).toHaveBeenCalledWith(mockClient, WALLET_ID, "Amazon", 6);
    expect(insertTransaction).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ creditGroupId: "existing-group-id", installmentNumber: 3, installmentTotal: 6 }),
    );
  });

  it("mints a fresh credit_group_id when no existing series is found", async () => {
    await importTransactions(
      baseInput([
        { amount: "10.00", date: "2026-07-01", description: "Amazon", installmentNumber: 1, installmentTotal: 3 },
      ]),
    );

    const call = vi.mocked(insertTransaction).mock.calls[0]![1];
    expect(call.creditGroupId).toMatch(UUID_RE);
  });

  it("shares one freshly-minted credit_group_id across same-series rows in one batch", async () => {
    await importTransactions(
      baseInput([
        { amount: "10.00", date: "2026-07-01", description: "Amazon", installmentNumber: 1, installmentTotal: 3 },
        { amount: "10.00", date: "2026-08-01", description: "Amazon", installmentNumber: 2, installmentTotal: 3 },
      ]),
    );

    const [firstCall, secondCall] = vi.mocked(insertTransaction).mock.calls;
    expect(firstCall![1].creditGroupId).toBe(secondCall![1].creditGroupId);
    // only queried once for the series, not once per row
    expect(findExistingCreditGroupId).toHaveBeenCalledTimes(1);
  });

  it("never sets a credit_group_id for a non-installment row", async () => {
    await importTransactions(baseInput([{ amount: "10.00", date: "2026-07-01", description: "Uber" }]));

    const call = vi.mocked(insertTransaction).mock.calls[0]![1];
    expect(call.creditGroupId).toBeUndefined();
    expect(call.installmentNumber).toBeUndefined();
    expect(call.installmentTotal).toBeUndefined();
  });

  it("anchors term to the row's own month, not today", async () => {
    await importTransactions(baseInput([{ amount: "10.00", date: "2026-02-20", description: "Uber" }]));

    const call = vi.mocked(insertTransaction).mock.calls[0]![1];
    expect(call.term).toBe("2026-02-15");
  });

  it("computes summary counts across a mixed batch", async () => {
    vi.mocked(findExistingCreditTxnKeys).mockResolvedValue([
      { amount: "5.00", date: "2026-07-02", description: "Dup" },
    ]);

    const result = await importTransactions(
      baseInput([
        { amount: "10.00", date: "2026-07-01", description: "Uber" },
        { amount: "-5.00", date: "2026-07-02", description: "Payment" },
        { amount: "5.00", date: "2026-07-02", description: "Dup" },
      ]),
    );

    expect(result.summary).toEqual({ importedCount: 1, skippedCount: 2, totalRows: 3 });
  });
});
