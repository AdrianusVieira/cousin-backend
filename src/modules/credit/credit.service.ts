import { pool } from "../../db/pool.js";
import { subtractMonths, toISODate, today } from "../../lib/date.js";
import { fromCents, toCents } from "../../lib/money.js";
import {
  findTransactionsByIds,
  setTransactionsSettled,
} from "../transactions/transactions.repository.js";
import { mapFullTransaction, type Transaction } from "../transactions/transactions.types.js";
import { findCreditTransactions } from "./credit.repository.js";
import type { CreditListQuery, SettleInput } from "./credit.schema.js";

export async function listCredit(query: CreditListQuery) {
  const now = today();
  const to =
    query.to ??
    toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const from =
    query.from ??
    toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));

  const settled =
    query.status === "settled" ? true : query.status === "unsettled" ? false : undefined;

  const rows = await findCreditTransactions(pool, { from, to, settled });
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

export async function settleCredit(input: SettleInput): Promise<Transaction[]> {
  await setTransactionsSettled(pool, input.transactionIds);
  const rows = await findTransactionsByIds(pool, input.transactionIds);
  return rows.map(mapFullTransaction);
}
