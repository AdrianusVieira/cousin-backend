import type { Pool, PoolClient } from "pg";
import type { TxnFromType, TxnToType } from "../../lib/transactions.js";

export interface WalletDebitTxnRow {
  date: string;
  amount: string;
  from_type: TxnFromType;
  from_id: string | null;
  to_type: TxnToType;
  to_id: string | null;
}

/** Debit transactions touching `walletId`'s balance, dated after `since` (exclusive). */
export async function getWalletDebitTxnsSince(
  db: Pool | PoolClient,
  walletId: string,
  since: string,
): Promise<WalletDebitTxnRow[]> {
  const { rows } = await db.query<WalletDebitTxnRow>(
    `select to_char(date, 'YYYY-MM-DD') as date, amount, from_type, from_id, to_type, to_id
     from transactions
     where method = 'debit'
       and date > $2
       and (
         (from_type = 'wallet' and from_id = $1) or
         (to_type = 'wallet' and to_id = $1)
       )
     order by date asc`,
    [walletId, since],
  );
  return rows;
}

/**
 * Inserts a Manual Adjustment transaction: from/to both point at `walletId`,
 * `amount` is the signed balance delta. method is always 'debit' since it
 * affects the wallet balance.
 */
export async function insertManualAdjustment(
  client: PoolClient,
  walletId: string,
  amount: string,
  date: string,
): Promise<void> {
  await client.query(
    `insert into transactions (amount, date, method, from_type, from_id, to_type, to_id)
     values ($1, $2, 'debit', 'wallet', $3, 'wallet', $3)`,
    [amount, date, walletId],
  );
}
