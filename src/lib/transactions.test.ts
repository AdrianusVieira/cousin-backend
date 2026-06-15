import { describe, expect, it } from "vitest";
import { classifyTransaction, walletBalanceDelta } from "./transactions.js";

const WALLET_A = "11111111-1111-1111-1111-111111111111";
const WALLET_B = "22222222-2222-2222-2222-222222222222";

describe("classifyTransaction", () => {
  it("classifies money entering the system", () => {
    expect(classifyTransaction({ fromType: "external", fromId: null, toType: "wallet", toId: WALLET_A })).toEqual({
      kind: "moneyIn",
      sign: "+",
    });
  });

  it("classifies money leaving the system", () => {
    expect(classifyTransaction({ fromType: "wallet", fromId: WALLET_A, toType: "external", toId: null })).toEqual({
      kind: "moneyOut",
      sign: "-",
    });
  });

  it("classifies revenue realized", () => {
    expect(
      classifyTransaction({ fromType: "revenue", fromId: WALLET_A, toType: "wallet", toId: WALLET_B }),
    ).toEqual({ kind: "revenueRealized", sign: "+" });
  });

  it("classifies bill paid", () => {
    expect(classifyTransaction({ fromType: "wallet", fromId: WALLET_A, toType: "bill", toId: WALLET_B })).toEqual({
      kind: "billPaid",
      sign: "-",
    });
  });

  it("classifies internal transfer for different wallets", () => {
    expect(
      classifyTransaction({ fromType: "wallet", fromId: WALLET_A, toType: "wallet", toId: WALLET_B }),
    ).toEqual({ kind: "internalTransfer", sign: null });
  });

  it("classifies manual adjustment for the same wallet", () => {
    expect(
      classifyTransaction({ fromType: "wallet", fromId: WALLET_A, toType: "wallet", toId: WALLET_A }),
    ).toEqual({ kind: "manualAdjustment", sign: null });
  });

  it("rejects illegal combinations", () => {
    expect(
      classifyTransaction({ fromType: "revenue", fromId: WALLET_A, toType: "bill", toId: WALLET_B }),
    ).toBeNull();
    expect(
      classifyTransaction({ fromType: "external", fromId: null, toType: "external", toId: null }),
    ).toBeNull();
  });
});

describe("walletBalanceDelta", () => {
  it("ignores credit transactions", () => {
    const delta = walletBalanceDelta(
      { method: "credit", amount: 100, fromType: "wallet", fromId: WALLET_A, toType: "external", toId: null },
      WALLET_A,
    );
    expect(delta).toBe(0);
  });

  it("applies a positive delta when money enters the wallet", () => {
    const delta = walletBalanceDelta(
      { method: "debit", amount: 100, fromType: "external", fromId: null, toType: "wallet", toId: WALLET_A },
      WALLET_A,
    );
    expect(delta).toBe(100);
  });

  it("applies a negative delta when money leaves the wallet", () => {
    const delta = walletBalanceDelta(
      { method: "debit", amount: 100, fromType: "wallet", fromId: WALLET_A, toType: "external", toId: null },
      WALLET_A,
    );
    expect(delta).toBe(-100);
  });

  it("applies opposite deltas to each side of an internal transfer", () => {
    const txn = {
      method: "debit" as const,
      amount: 100,
      fromType: "wallet" as const,
      fromId: WALLET_A,
      toType: "wallet" as const,
      toId: WALLET_B,
    };
    expect(walletBalanceDelta(txn, WALLET_A)).toBe(-100);
    expect(walletBalanceDelta(txn, WALLET_B)).toBe(100);
  });

  it("applies the signed amount directly for a manual adjustment", () => {
    const increase = walletBalanceDelta(
      { method: "debit", amount: 50, fromType: "wallet", fromId: WALLET_A, toType: "wallet", toId: WALLET_A },
      WALLET_A,
    );
    expect(increase).toBe(50);

    const decrease = walletBalanceDelta(
      { method: "debit", amount: -50, fromType: "wallet", fromId: WALLET_A, toType: "wallet", toId: WALLET_A },
      WALLET_A,
    );
    expect(decrease).toBe(-50);
  });

  it("returns 0 for a wallet not involved in the transaction", () => {
    const delta = walletBalanceDelta(
      { method: "debit", amount: 100, fromType: "wallet", fromId: WALLET_A, toType: "external", toId: null },
      WALLET_B,
    );
    expect(delta).toBe(0);
  });
});
