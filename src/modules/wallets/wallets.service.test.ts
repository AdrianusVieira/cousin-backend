import { describe, expect, it } from "vitest";
import { buildBalanceSeries } from "./wallets.service.js";

const WALLET = "11111111-1111-1111-1111-111111111111";
const EXTERNAL = null;

describe("buildBalanceSeries", () => {
  it("returns a flat series when there are no transactions", () => {
    const series = buildBalanceSeries("100.00", [], WALLET, "2026-06-01", "2026-06-03");

    expect(series).toEqual([
      { date: "2026-06-01", balance: "100.00" },
      { date: "2026-06-02", balance: "100.00" },
      { date: "2026-06-03", balance: "100.00" },
    ]);
  });

  it("walks backwards from the current balance through past transactions", () => {
    // Money came in on 06-02 (+50), so balance before that day was 50.00.
    const txns = [
      {
        date: "2026-06-02",
        amount: "50.00",
        from_type: "external" as const,
        from_id: EXTERNAL,
        to_type: "wallet" as const,
        to_id: WALLET,
      },
    ];

    const series = buildBalanceSeries("100.00", txns, WALLET, "2026-06-01", "2026-06-03");

    expect(series).toEqual([
      { date: "2026-06-01", balance: "50.00" },
      { date: "2026-06-02", balance: "100.00" },
      { date: "2026-06-03", balance: "100.00" },
    ]);
  });

  it("nets multiple transactions on the same day", () => {
    const txns = [
      {
        date: "2026-06-02",
        amount: "50.00",
        from_type: "external" as const,
        from_id: EXTERNAL,
        to_type: "wallet" as const,
        to_id: WALLET,
      },
      {
        date: "2026-06-02",
        amount: "20.00",
        from_type: "wallet" as const,
        from_id: WALLET,
        to_type: "external" as const,
        to_id: EXTERNAL,
      },
    ];

    const series = buildBalanceSeries("100.00", txns, WALLET, "2026-06-01", "2026-06-02");

    expect(series).toEqual([
      { date: "2026-06-01", balance: "70.00" },
      { date: "2026-06-02", balance: "100.00" },
    ]);
  });
});
