import type { Pool, PoolClient } from "pg";

export interface ForecastEvent {
  id: string;
  type: "bill" | "revenue" | "credit";
  label: string;
  date: string;
  amount: string;
}

/** Subtract linked payments from obligations so a payment and its bill are never forecast twice. */
export async function findForecastEvents(
  db: Pool | PoolClient,
  to: string,
): Promise<ForecastEvent[]> {
  const { rows } = await db.query<ForecastEvent>(
    `
    select * from (
      select b.id, 'bill' as type, b.name as label, to_char(b.term, 'YYYY-MM-DD') as date,
        greatest(b.value - coalesce((select sum(t.amount) from transactions t
          where t.to_type = 'bill' and t.to_id = b.id), 0), 0)::text as amount
      from bills b where not b.paid and b.term <= $1
      union all
      select r.id, 'revenue', r.name, to_char(r.term, 'YYYY-MM-DD'),
        greatest(r.value - coalesce((select sum(t.amount) from transactions t
          where t.from_type = 'revenue' and t.from_id = r.id), 0), 0)::text
      from revenues r where not r.received and r.term <= $1
      union all
      select t.id, 'credit', coalesce(t.description, w.name, 'Card payment'),
        to_char(coalesce(t.term, t.date), 'YYYY-MM-DD'), t.amount::text
      from transactions t left join wallets w on w.id = t.from_id
      where t.method = 'credit' and not t.settled and coalesce(t.term, t.date) <= $1
    ) events where amount::numeric > 0 order by date, id
  `,
    [to],
  );
  return rows;
}

export async function findForecastOpeningBalance(db: Pool | PoolClient): Promise<string> {
  const { rows } = await db.query<{ balance: string }>(
    "select coalesce(sum(balance), 0)::text as balance from wallets where not archived",
  );
  return rows[0]!.balance;
}
