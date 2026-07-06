import type { Pool, PoolClient } from "pg";
import type { TxnFromType, TxnMethod, TxnToType } from "../../lib/transactions.js";
import type { FullTransactionRow } from "./transactions.types.js";

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

// ---------------------------------------------------------------------------
// Full transaction queries (with name resolution for from/to endpoints)
// ---------------------------------------------------------------------------

export const FULL_TXN_SELECT = `
  select
    t.id,
    t.amount::text as amount,
    to_char(t.date, 'YYYY-MM-DD') as date,
    t.description,
    t.method,
    t.category_id,
    c.name as category_name,
    t.from_type,
    t.from_id,
    case t.from_type
      when 'wallet'  then (select name from wallets  where id = t.from_id)
      when 'revenue' then (select name from revenues where id = t.from_id)
      else null
    end as from_name,
    t.to_type,
    t.to_id,
    case t.to_type
      when 'wallet' then (select name from wallets where id = t.to_id)
      when 'bill'   then (select name from bills   where id = t.to_id)
      else null
    end as to_name,
    t.installment_number,
    t.installment_total,
    t.credit_group_id,
    t.settled,
    to_char(t.term, 'YYYY-MM-DD') as term,
    t.created_at,
    t.updated_at
  from transactions t
  left join categories c on c.id = t.category_id`;

export interface TransactionListFilter {
  from: string;
  to: string;
  method?: "debit" | "credit" | "all";
  categoryId?: string;
  walletId?: string;
  cursor?: { date: string; id: string };
  limit: number;
}

export async function findAllTransactions(
  db: Pool | PoolClient,
  filter: TransactionListFilter,
): Promise<FullTransactionRow[]> {
  const conditions: string[] = ["t.date between $1 and $2"];
  const values: unknown[] = [filter.from, filter.to];

  if (filter.method && filter.method !== "all") {
    values.push(filter.method);
    conditions.push(`t.method = $${values.length}`);
  }
  if (filter.categoryId) {
    values.push(filter.categoryId);
    conditions.push(`t.category_id = $${values.length}`);
  }
  if (filter.walletId) {
    values.push(filter.walletId);
    conditions.push(
      `((t.from_type = 'wallet' and t.from_id = $${values.length}) or (t.to_type = 'wallet' and t.to_id = $${values.length}))`,
    );
  }
  if (filter.cursor) {
    values.push(filter.cursor.date);
    values.push(filter.cursor.id);
    conditions.push(
      `(t.date < $${values.length - 1} or (t.date = $${values.length - 1} and t.id < $${values.length}))`,
    );
  }

  values.push(filter.limit + 1);

  const where = `where ${conditions.join(" and ")}`;
  const { rows } = await db.query<FullTransactionRow>(
    `${FULL_TXN_SELECT} ${where} order by t.date desc, t.id desc limit $${values.length}`,
    values,
  );
  return rows;
}

export async function findTransactionById(
  db: Pool | PoolClient,
  id: string,
): Promise<FullTransactionRow | null> {
  const { rows } = await db.query<FullTransactionRow>(
    `${FULL_TXN_SELECT} where t.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findLinkedTransactionForBill(
  db: Pool | PoolClient,
  billId: string,
): Promise<FullTransactionRow | null> {
  const { rows } = await db.query<FullTransactionRow>(
    `${FULL_TXN_SELECT} where t.to_type = 'bill' and t.to_id = $1 limit 1`,
    [billId],
  );
  return rows[0] ?? null;
}

export async function findLinkedTransactionForRevenue(
  db: Pool | PoolClient,
  revenueId: string,
): Promise<FullTransactionRow | null> {
  const { rows } = await db.query<FullTransactionRow>(
    `${FULL_TXN_SELECT} where t.from_type = 'revenue' and t.from_id = $1 limit 1`,
    [revenueId],
  );
  return rows[0] ?? null;
}

export interface TransactionSummaryRow {
  total_in: string;
  total_out: string;
}

export async function findTransactionSummary(
  db: Pool | PoolClient,
  filter: Omit<TransactionListFilter, "cursor" | "limit">,
): Promise<TransactionSummaryRow> {
  const conditions: string[] = ["date between $1 and $2"];
  const values: unknown[] = [filter.from, filter.to];

  if (filter.method && filter.method !== "all") {
    values.push(filter.method);
    conditions.push(`method = $${values.length}`);
  }
  if (filter.categoryId) {
    values.push(filter.categoryId);
    conditions.push(`category_id = $${values.length}`);
  }
  if (filter.walletId) {
    values.push(filter.walletId);
    conditions.push(
      `((from_type = 'wallet' and from_id = $${values.length}) or (to_type = 'wallet' and to_id = $${values.length}))`,
    );
  }

  const where = `where ${conditions.join(" and ")}`;
  const { rows } = await db.query<TransactionSummaryRow>(
    `select
       sum(case when from_type in ('external','revenue') and to_type = 'wallet' then amount else 0.00 end)::text as total_in,
       sum(case when from_type = 'wallet' and to_type in ('external','bill') then amount else 0.00 end)::text as total_out
     from transactions ${where}`,
    values,
  );
  return rows[0]!;
}

export interface InsertTransactionInput {
  amount: string;
  date: string;
  description?: string;
  method: TxnMethod;
  categoryId?: string;
  fromType: TxnFromType;
  fromId?: string;
  toType: TxnToType;
  toId?: string;
  installmentNumber?: number;
  installmentTotal?: number;
  creditGroupId?: string;
  settled?: boolean;
  term?: string;
}

export async function insertTransaction(
  db: Pool | PoolClient,
  input: InsertTransactionInput,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into transactions (
       amount, date, description, method, category_id,
       from_type, from_id, to_type, to_id,
       installment_number, installment_total, credit_group_id,
       settled, term
     ) values (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9,
       $10, $11, $12,
       $13, $14
     ) returning id`,
    [
      input.amount,
      input.date,
      input.description ?? null,
      input.method,
      input.categoryId ?? null,
      input.fromType,
      input.fromId ?? null,
      input.toType,
      input.toId ?? null,
      input.installmentNumber ?? null,
      input.installmentTotal ?? null,
      input.creditGroupId ?? null,
      input.settled ?? true,
      input.term ?? null,
    ],
  );
  return rows[0]!.id;
}

export interface UpdateTransactionFields {
  amount?: string;
  date?: string;
  description?: string;
  categoryId?: string | null;
}

export async function updateTransaction(
  db: Pool | PoolClient,
  id: string,
  fields: UpdateTransactionFields,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.amount !== undefined) {
    values.push(fields.amount);
    sets.push(`amount = $${values.length}`);
  }
  if (fields.date !== undefined) {
    values.push(fields.date);
    sets.push(`date = $${values.length}`);
  }
  if ("description" in fields) {
    values.push(fields.description ?? null);
    sets.push(`description = $${values.length}`);
  }
  if ("categoryId" in fields) {
    values.push(fields.categoryId ?? null);
    sets.push(`category_id = $${values.length}`);
  }

  values.push(id);
  await db.query(
    `update transactions set ${sets.join(", ")} where id = $${values.length}`,
    values,
  );
}

export async function deleteTransaction(db: Pool | PoolClient, id: string): Promise<void> {
  await db.query(`delete from transactions where id = $1`, [id]);
}

export async function findTransactionsByIds(
  db: Pool | PoolClient,
  ids: string[],
): Promise<FullTransactionRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<FullTransactionRow>(
    `${FULL_TXN_SELECT} where t.id = any($1::uuid[]) order by t.date desc, t.id desc`,
    [ids],
  );
  return rows;
}

export async function setTransactionsSettled(
  db: Pool | PoolClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.query(
    `update transactions set settled = true where id = any($1::uuid[])`,
    [ids],
  );
}
