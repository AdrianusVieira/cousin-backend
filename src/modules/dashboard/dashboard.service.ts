import { pool } from "../../db/pool.js";
import { subtractMonths, toISODate, today } from "../../lib/date.js";
import { fromCents, toCents } from "../../lib/money.js";
import {
  findCashFlow,
  findInflowTransactions,
  findOutflowTransactions,
  findPendingCreditPerWallet,
  findPendingCreditSummary,
  findUnpaidBills,
  findUnreceivedRevenues,
} from "./dashboard.repository.js";

function savingsRate(incomeCents: number, netCents: number): number {
  if (incomeCents === 0) return 0;
  return Math.round((netCents / incomeCents) * 10000) / 100;
}

export async function getDashboard(query: { from?: string; to?: string }) {
  const now = today();
  const to =
    query.to ??
    toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const from = query.from ?? toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));

  const [
    inflow,
    outflow,
    unpaidBillsStr,
    unreceivedRevenuesStr,
    cashFlow,
    pendingTotal,
    pendingPerWallet,
  ] = await Promise.all([
    findInflowTransactions(pool, { from, to }),
    findOutflowTransactions(pool, { from, to }),
    findUnpaidBills(pool, { from, to }),
    findUnreceivedRevenues(pool, { from, to }),
    findCashFlow(pool, { from, to }),
    findPendingCreditSummary(pool),
    findPendingCreditPerWallet(pool),
  ]);

  const incomeCents =
    toCents(inflow.settled_total) + toCents(inflow.pending_credit) + toCents(unreceivedRevenuesStr);
  const outcomeCents =
    toCents(outflow.settled_total) + toCents(outflow.pending_credit) + toCents(unpaidBillsStr);
  const netCents = incomeCents - outcomeCents;

  return {
    income: {
      pendingCredit: inflow.pending_credit,
      settled: inflow.settled_total,
      total: fromCents(incomeCents),
      unreceived: unreceivedRevenuesStr,
    },
    outcome: {
      pendingCredit: outflow.pending_credit,
      settled: outflow.settled_total,
      total: fromCents(outcomeCents),
      unpaid: unpaidBillsStr,
    },
    net: fromCents(netCents),
    savingsRate: savingsRate(incomeCents, netCents),
    cashFlow: cashFlow.map((r) => ({ date: r.date, in: r.in, out: r.out })),
    pendingCredit: {
      total: pendingTotal,
      perWallet: pendingPerWallet.map((r) => ({
        walletId: r.wallet_id,
        walletName: r.wallet_name,
        total: r.total,
      })),
    },
  };
}
