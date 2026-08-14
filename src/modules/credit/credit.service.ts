import { pool } from "../../db/pool.js";
import { toISODate, today } from "../../lib/date.js";
import { fromCents, toCents } from "../../lib/money.js";
import {
  findTransactionsByIds,
  setTransactionsSettled,
} from "../transactions/transactions.repository.js";
import { applyBalanceDeltas } from "../transactions/transactions.service.js";
import { mapFullTransaction, type Transaction } from "../transactions/transactions.types.js";
import { findCreditTransactions } from "./credit.repository.js";
import type { CreditListQuery, SettleInput } from "./credit.schema.js";

export async function listCredit(query: CreditListQuery) {
  const settled =
    query.status === "settled" ? true : query.status === "unsettled" ? false : undefined;

  const rows = await findCreditTransactions(pool, { settled });
  const transactions = rows.map(mapFullTransaction);

  // Group by (walletId, term)
  const groupMap = new Map<string, {
    walletId: string;
    walletName: string;
    term: string;
    transactions: Transaction[];
  }>();

  for (const txn of transactions) {
    const walletId = txn.from.id ?? "";
    const walletName = txn.from.name ?? "";
    const term = txn.term ?? "";
    const key = `${walletId}::${term}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, { walletId, walletName, term, transactions: [] });
    }
    groupMap.get(key)!.transactions.push(txn);
  }

  let pendingCreditCents = 0;
  let openStatements = 0;
  let settledInPeriodCents = 0;

  const groups = Array.from(groupMap.values()).map((g) => {
    const allSettled = g.transactions.every((t) => t.settled);
    const totalCents = g.transactions.reduce(
      (sum, t) => sum + toCents(t.amount),
      0,
    );

    if (allSettled) {
      settledInPeriodCents += totalCents;
    } else {
      pendingCreditCents += totalCents;
      openStatements++;
    }

    return {
      walletId: g.walletId,
      walletName: g.walletName,
      term: g.term,
      total: fromCents(totalCents),
      settled: allSettled,
      transactions: g.transactions,
    };
  });

  return {
    summary: {
      pendingCredit: fromCents(pendingCreditCents),
      openStatements,
      settledInPeriod: fromCents(settledInPeriodCents),
    },
    groups,
  };
}

/**
 * Settling a statement is when its money actually leaves the wallet, so this
 * flips the flag and applies the balance deltas in one DB transaction. Only the
 * rows the guarded update actually changed are debited, which makes settling the
 * same ids twice a no-op rather than a double charge.
 */
export async function settleCredit(input: SettleInput): Promise<Transaction[]> {
  const settledAt = toISODate(today());

  const client = await pool.connect();
  try {
    await client.query("begin");

    const settledRows = await setTransactionsSettled(client, input.transactionIds, settledAt);

    for (const row of settledRows) {
      await applyBalanceDeltas(client, {
        method: "credit",
        amount: toCents(row.amount),
        fromType: row.from_type,
        fromId: row.from_id ?? undefined,
        toType: row.to_type,
        toId: row.to_id ?? undefined,
        settled: true,
      });
    }

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  const rows = await findTransactionsByIds(pool, input.transactionIds);
  return rows.map(mapFullTransaction);
}
