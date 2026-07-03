import type { Pool, PoolClient } from "pg";

export interface ExistingCreditTxnKey {
  amount: string;
  date: string;
  description: string | null;
}

/**
 * All credit purchases on this wallet whose date falls in [fromDate, toDate] — used to build the
 * dedup key set for one import batch.
 */
export async function findExistingCreditTxnKeys(
  db: Pool | PoolClient,
  walletId: string,
  fromDate: string,
  toDate: string,
): Promise<ExistingCreditTxnKey[]> {
  const { rows } = await db.query<ExistingCreditTxnKey>(
    `select to_char(date, 'YYYY-MM-DD') as date, description, amount::text as amount
     from transactions
     where method = 'credit' and from_type = 'wallet' and from_id = $1
       and date between $2 and $3`,
    [walletId, fromDate, toDate],
  );
  return rows;
}

/**
 * Finds an existing installment series to attach to, matched on wallet + normalized description +
 * installment_total (not date-scoped — a sibling installment may be many months in the past).
 * Returns the shared credit_group_id of the first match, or null if this is a new series.
 */
export async function findExistingCreditGroupId(
  db: Pool | PoolClient,
  walletId: string,
  normalizedDescription: string,
  installmentTotal: number,
): Promise<string | null> {
  const { rows } = await db.query<{ credit_group_id: string }>(
    `select credit_group_id
     from transactions
     where method = 'credit' and from_type = 'wallet' and from_id = $1
       and installment_total = $2
       and description = $3
       and credit_group_id is not null
     order by installment_number asc
     limit 1`,
    [walletId, installmentTotal, normalizedDescription],
  );
  return rows[0]?.credit_group_id ?? null;
}
