import type { Pool, PoolClient } from "pg";

/**
 * The date money actually leaves or enters a wallet. Debit settles on the
 * purchase date; credit settles on its statement date (`term`), which for an
 * installment purchase advances one month per installment — so each installment
 * lands in the month it is charged, not in the month of the purchase. Used by
 * the Income and Outcome totals; the cash flow series stays on the purchase
 * date so the chart shows the day each movement was made.
 */
const CASH_DATE = "coalesce(t.term, t.date)";

/** Credit that has not been settled yet has not moved money: it is committed, not spent. */
const PENDING_CREDIT = "t.method = 'credit' and t.settled = false";

export interface FlowTotals {
  pending_credit: string;
  settled_total: string;
}

const EMPTY_FLOW: FlowTotals = { pending_credit: "0.00", settled_total: "0.00" };

export async function findInflowTransactions(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<FlowTotals> {
  const { rows } = await db.query<FlowTotals>(
    `select
       coalesce(sum(t.amount) filter (where ${PENDING_CREDIT}), 0.00)::text as pending_credit,
       coalesce(sum(t.amount) filter (where not (${PENDING_CREDIT})), 0.00)::text as settled_total
     from transactions t
     where t.from_type in ('external', 'revenue')
       and t.to_type = 'wallet'
       and ${CASH_DATE} between $1 and $2`,
    [from, to],
  );
  return rows[0] ?? EMPTY_FLOW;
}

export async function findOutflowTransactions(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<FlowTotals> {
  const { rows } = await db.query<FlowTotals>(
    `select
       coalesce(sum(t.amount) filter (where ${PENDING_CREDIT}), 0.00)::text as pending_credit,
       coalesce(sum(t.amount) filter (where not (${PENDING_CREDIT})), 0.00)::text as settled_total
     from transactions t
     where t.from_type = 'wallet'
       and t.to_type in ('external', 'bill')
       and ${CASH_DATE} between $1 and $2`,
    [from, to],
  );
  return rows[0] ?? EMPTY_FLOW;
}

export async function findUnpaidBills(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<string> {
  const { rows } = await db.query<{ total: string }>(
    `select coalesce(sum(b.value), 0.00)::text as total
     from bills b
     where b.paid = false
       and b.term between $1 and $2`,
    [from, to],
  );
  return rows[0]?.total ?? "0.00";
}

export async function findUnreceivedRevenues(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<string> {
  const { rows } = await db.query<{ total: string }>(
    `select coalesce(sum(rv.value), 0.00)::text as total
     from revenues rv
     where rv.received = false
       and rv.term between $1 and $2`,
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
       to_char(d.date, 'YYYY-MM-DD') as date,
       coalesce(sum(case when t.from_type in ('external','revenue') and t.to_type = 'wallet' then t.amount end), 0.00)::text as "in",
       coalesce(sum(case when t.from_type = 'wallet' and t.to_type in ('external','bill') then t.amount end), 0.00)::text as "out"
     from generate_series($1::date, $2::date, interval '1 day') as d(date)
     left join transactions t
       -- Purchase date, not the cash date: this series answers "what did I move
       -- on this day", so a credit purchase lands on the day it was made.
       on t.date = d.date
       and not (t.from_type = 'wallet' and t.to_type = 'wallet')
     group by d.date
     order by d.date asc`,
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
