import { dateRange, subtractMonths, toISODate, today } from "../../lib/date.js";
import { NotFoundError } from "../../lib/errors.js";
import { fromCents, toCents } from "../../lib/money.js";
import { walletBalanceDelta } from "../../lib/transactions.js";
import { pool } from "../../db/pool.js";
import {
  getWalletDebitTxnsSince,
  insertManualAdjustment,
  type WalletDebitTxnRow,
} from "../transactions/transactions.repository.js";
import {
  createWallet as createWalletRow,
  findAllWallets,
  findWalletById,
  setWalletArchived,
  updateWallet,
} from "./wallets.repository.js";
import type { CreateWalletInput, PatchWalletInput } from "./wallets.schema.js";
import { rowToWallet, type Wallet } from "./wallets.types.js";

interface BalancePoint {
  date: string;
  balance: string;
}

/** Reconstructs end-of-day balances for `walletId` over [from, to] from its debit transactions. */
export function buildBalanceSeries(
  currentBalance: string,
  txns: WalletDebitTxnRow[],
  walletId: string,
  from: string,
  to: string,
): BalancePoint[] {
  const deltaByDate = new Map<string, number>();
  for (const txn of txns) {
    const delta = walletBalanceDelta(
      {
        method: "debit",
        amount: toCents(txn.amount),
        fromType: txn.from_type,
        fromId: txn.from_id,
        toType: txn.to_type,
        toId: txn.to_id,
      },
      walletId,
    );
    deltaByDate.set(txn.date, (deltaByDate.get(txn.date) ?? 0) + delta);
  }

  const dates = dateRange(from, to);
  const points: BalancePoint[] = [];
  let running = toCents(currentBalance);

  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i]!;
    points.push({ date, balance: fromCents(running) });
    running -= deltaByDate.get(date) ?? 0;
  }

  return points.reverse();
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function listWallets(filter: { active?: boolean }) {
  const [allRows, filteredRows] = await Promise.all([
    findAllWallets(pool),
    findAllWallets(pool, filter),
  ]);

  const activeRows = allRows.filter((row) => !row.archived);
  const totalPatrimonyCents = activeRows.reduce((sum, row) => sum + toCents(row.balance), 0);

  const to = today();
  const from = subtractMonths(to, 3);
  const toIso = toISODate(to);
  const fromIso = toISODate(from);

  const seriesByWallet = new Map<string, BalancePoint[]>();
  for (const row of activeRows) {
    const txns = await getWalletDebitTxnsSince(pool, row.id, fromIso);
    seriesByWallet.set(row.id, buildBalanceSeries(row.balance, txns, row.id, fromIso, toIso));
  }

  const dates = dateRange(fromIso, toIso);
  const trend = dates.map((date, i) => {
    const total = activeRows.reduce((sum, row) => {
      const point = seriesByWallet.get(row.id)?.[i];
      return sum + toCents(point?.balance ?? row.balance);
    }, 0);
    return { date, total: fromCents(total) };
  });

  const trendAverageCents = average(trend.map((point) => toCents(point.total)));
  const patrimonyDeltaCents = totalPatrimonyCents - trendAverageCents;

  const items = filteredRows.map((row) => {
    const series = seriesByWallet.get(row.id);
    const walletAverageCents = series
      ? average(series.map((point) => toCents(point.balance)))
      : toCents(row.balance);
    return {
      ...rowToWallet(row),
      vsAverageDelta: fromCents(toCents(row.balance) - walletAverageCents),
    };
  });

  return {
    summary: {
      totalPatrimony: fromCents(totalPatrimonyCents),
      activeCount: activeRows.length,
      archivedCount: allRows.length - activeRows.length,
      patrimonyVs3moAvg: {
        delta: fromCents(patrimonyDeltaCents),
        pct: trendAverageCents === 0 ? 0 : (patrimonyDeltaCents / trendAverageCents) * 100,
      },
    },
    trend,
    items,
  };
}

export async function getWalletDetail(id: string, range: { from?: string; to?: string }) {
  const row = await findWalletById(pool, id);
  if (!row) throw new NotFoundError("Wallet not found");

  const to = range.to ?? toISODate(today());
  const from = range.from ?? toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));

  const txns = await getWalletDebitTxnsSince(pool, id, from);
  const balanceSeries = buildBalanceSeries(row.balance, txns, id, from, to);
  const threeMonthAverageCents = average(balanceSeries.map((point) => toCents(point.balance)));

  return {
    wallet: rowToWallet(row),
    summary: {
      currentBalance: row.balance,
      threeMonthAverage: fromCents(threeMonthAverageCents),
    },
    balanceSeries,
  };
}

export async function createWallet(input: CreateWalletInput): Promise<Wallet> {
  const row = await createWalletRow(pool, input);
  return rowToWallet(row);
}

export async function patchWallet(id: string, input: PatchWalletInput): Promise<Wallet> {
  const existing = await findWalletById(pool, id);
  if (!existing) throw new NotFoundError("Wallet not found");

  const client = await pool.connect();
  try {
    await client.query("begin");

    const row = await updateWallet(client, id, input);

    if (input.balance !== undefined) {
      const deltaCents = toCents(input.balance) - toCents(existing.balance);
      if (deltaCents !== 0) {
        await insertManualAdjustment(client, id, fromCents(deltaCents), toISODate(today()));
      }
    }

    await client.query("commit");
    return rowToWallet(row);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function setWalletArchiveStatus(id: string, archived: boolean): Promise<Wallet> {
  const existing = await findWalletById(pool, id);
  if (!existing) throw new NotFoundError("Wallet not found");

  const row = await setWalletArchived(pool, id, archived);
  return rowToWallet(row);
}
