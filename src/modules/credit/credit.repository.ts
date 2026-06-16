import type { Pool, PoolClient } from "pg";
import { FULL_TXN_SELECT } from "../transactions/transactions.repository.js";
import type { FullTransactionRow } from "../transactions/transactions.types.js";

export interface CreditListFilter {
  from: string;
  to: string;
  settled?: boolean;
}

export async function findCreditTransactions(
  db: Pool | PoolClient,
  filter: CreditListFilter,
): Promise<FullTransactionRow[]> {
  const conditions: string[] = [
    "t.method = 'credit'",
    "t.term between $1::date and $2::date",
  ];
  const values: unknown[] = [filter.from, filter.to];

  if (filter.settled !== undefined) {
    values.push(filter.settled);
    conditions.push(`t.settled = $${values.length}`);
  }

  const where = `where ${conditions.join(" and ")}`;
  const { rows } = await db.query<FullTransactionRow>(
    `${FULL_TXN_SELECT} ${where} order by t.term asc, t.from_id asc, t.id asc`,
    values,
  );
  return rows;
}
