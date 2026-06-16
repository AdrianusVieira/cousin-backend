import { pool } from "../../db/pool.js";
import { subtractMonths, toISODate, today } from "../../lib/date.js";
import { fromCents, toCents } from "../../lib/money.js";
import {
  findCashFlow,
  findDashboardOutcome,
  findDashboardRevenue,
  findPendingCreditPerWallet,
  findPendingCreditSummary,
} from "./dashboard.repository.js";

function savingsRate(revenueCents: number, netCents: number): number {
  if (revenueCents === 0) return 0;
  return Math.round((netCents / revenueCents) * 10000) / 100;
}

export async function getDashboard(query: { from?: string; to?: string }) {
  const now = today();
  const to =
    query.to ??
    toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const from = query.from ?? toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const periodMs = toDate.getTime() - fromDate.getTime();
  const priorToDate = new Date(fromDate.getTime() - 86400000);
  const priorFromDate = new Date(priorToDate.getTime() - periodMs);
  const priorFrom = toISODate(priorFromDate);
  const priorTo = toISODate(priorToDate);

  const [
    revenueStr,
    outcomeStr,
    priorRevenueStr,
    priorOutcomeStr,
    cashFlow,
    pendingTotal,
    pendingPerWallet,
  ] = await Promise.all([
    findDashboardRevenue(pool, { from, to }),
    findDashboardOutcome(pool, { from, to }),
    findDashboardRevenue(pool, { from: priorFrom, to: priorTo }),
    findDashboardOutcome(pool, { from: priorFrom, to: priorTo }),
    findCashFlow(pool, { from, to }),
    findPendingCreditSummary(pool, { from, to }),
    findPendingCreditPerWallet(pool, { from, to }),
  ]);

  const revenueCents = toCents(revenueStr);
  const outcomeCents = toCents(outcomeStr);
  const netCents = revenueCents - outcomeCents;
  const rate = savingsRate(revenueCents, netCents);

  const priorRevenueCents = toCents(priorRevenueStr);
  const priorOutcomeCents = toCents(priorOutcomeStr);
  const priorNetCents = priorRevenueCents - priorOutcomeCents;
  const hasPriorData = priorRevenueCents !== 0 || priorOutcomeCents !== 0;

  const priorRate = savingsRate(priorRevenueCents, priorNetCents);

  return {
    revenue: revenueStr,
    outcome: outcomeStr,
    net: fromCents(netCents),
    savingsRate: rate,
    savingsRateDelta: hasPriorData ? Math.round((rate - priorRate) * 100) / 100 : null,
    netDelta: hasPriorData ? fromCents(netCents - priorNetCents) : null,
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
