import type { Pool, PoolClient } from "pg";
import { FULL_TXN_SELECT } from "../transactions/transactions.repository.js";
import type { FullTransactionRow } from "../transactions/transactions.types.js";

export interface CreditListFilter {
  settled?: boolean;
}

export async function findCreditTransactions(
  db: Pool | PoolClient,
  filter: CreditListFilter,
): Promise<FullTransactionRow[]> {
  const conditions: string[] = ["t.method = 'credit'"];
  const values: unknown[] = [];

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
