import type { Pool, PoolClient } from "pg";

export async function findDashboardRevenue(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<string> {
  const { rows } = await db.query<{ total: string }>(
    `select coalesce(sum(rv.value), 0.00)::text as total
     from revenues rv
     where rv.term between $1 and $2`,
    [from, to],
  );
  return rows[0]?.total ?? "0.00";
}

export async function findDashboardOutcome(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<string> {
  const { rows } = await db.query<{ total: string }>(
    `select coalesce(sum(b.value), 0.00)::text as total
     from bills b
     where b.term between $1 and $2`,
    [from, to],
  );
  return rows[0]?.total ?? "0.00";
}

export interface CashFlowRow {
  date: string;
  in: string;
  out: string;
}

export async function findCashFlow(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<CashFlowRow[]> {
  const { rows } = await db.query<CashFlowRow>(
    `select
       to_char(t.date, 'YYYY-MM-DD') as date,
       sum(case when t.from_type in ('external','revenue') and t.to_type = 'wallet' then t.amount else 0.00 end)::text as "in",
       sum(case when t.from_type = 'wallet' and t.to_type in ('external','bill') then t.amount else 0.00 end)::text as "out"
     from transactions t
     where t.date between $1 and $2
       and not (t.from_type = 'wallet' and t.to_type = 'wallet')
     group by to_char(t.date, 'YYYY-MM-DD')
     order by date asc`,
    [from, to],
  );
  return rows;
}

export interface PendingCreditPerWalletRow {
  wallet_id: string;
  wallet_name: string;
  total: string;
}

export interface PendingCreditRow {
  total: string;
}

export async function findPendingCreditSummary(
  db: Pool | PoolClient,
): Promise<string> {
  const { rows } = await db.query<PendingCreditRow>(
    `select coalesce(sum(amount), 0.00)::text as total
     from transactions
     where method = 'credit' and settled = false`,
  );
  return rows[0]?.total ?? "0.00";
}

export async function findPendingCreditPerWallet(
  db: Pool | PoolClient,
): Promise<PendingCreditPerWalletRow[]> {
  const { rows } = await db.query<PendingCreditPerWalletRow>(
    `select
       t.from_id as wallet_id,
       w.name as wallet_name,
       coalesce(sum(t.amount), 0.00)::text as total
     from transactions t
     join wallets w on w.id = t.from_id
     where t.method = 'credit' and t.settled = false
     group by t.from_id, w.name
     order by w.name asc`,
  );
  return rows;
}
