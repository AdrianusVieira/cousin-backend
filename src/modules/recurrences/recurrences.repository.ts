import type { Pool, PoolClient } from "pg";
import type { IntervalUnit } from "../../lib/recurrences.js";
import type { RecurrenceRow } from "./recurrences.types.js";

export interface RecurrenceWithMeta extends RecurrenceRow {
  name: string | null;
  type: "bill" | "revenue" | null;
  next_instance: string | null;
}

export interface RecurrenceVarianceRow {
  date: string;
  bill_value: string;
  is_variable: boolean;
  estimated_value: string | null;
  actual_amount: string | null;
}

export interface CreateRecurrenceInput {
  isVariable: boolean;
  intervalUnit: IntervalUnit;
  intervalValue: number;
  recurrentDay: number;
  recurrentMonth?: number;
}

export async function createRecurrence(
  db: Pool | PoolClient,
  input: CreateRecurrenceInput,
): Promise<RecurrenceRow> {
  const { rows } = await db.query<RecurrenceRow>(
    `insert into recurrences (is_variable, interval_unit, interval_value, recurrent_day, recurrent_month)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [
      input.isVariable,
      input.intervalUnit,
      input.intervalValue,
      input.recurrentDay,
      input.recurrentMonth ?? null,
    ],
  );
  return rows[0]!;
}

export async function findRecurrenceById(
  db: Pool | PoolClient,
  id: string,
): Promise<RecurrenceRow | null> {
  const { rows } = await db.query<RecurrenceRow>(
    `select * from recurrences where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findAllRecurrencesWithMeta(
  db: Pool | PoolClient,
): Promise<RecurrenceWithMeta[]> {
  const { rows } = await db.query<RecurrenceWithMeta>(`
    with instances as (
      select recurrence_id, name, term, 'bill'::text as type
      from bills where recurrence_id is not null
      union all
      select recurrence_id, name, term, 'revenue'::text as type
      from revenues where recurrence_id is not null
    ),
    latest_name as (
      select distinct on (recurrence_id) recurrence_id, name, type
      from instances
      order by recurrence_id, term desc
    ),
    next_inst as (
      select recurrence_id, min(term) as next_instance_date
      from instances
      where term >= current_date
      group by recurrence_id
    )
    select
      r.id, r.is_variable, r.interval_unit, r.interval_value,
      r.recurrent_day, r.recurrent_month,
      r.estimated_value::text as estimated_value,
      r.created_at, r.updated_at,
      l.name,
      l.type,
      to_char(n.next_instance_date, 'YYYY-MM-DD') as next_instance
    from recurrences r
    left join latest_name l on l.recurrence_id = r.id
    left join next_inst n on n.recurrence_id = r.id
    order by l.name asc nulls last
  `);
  return rows;
}

export async function findRecurringOutflow(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<string> {
  const { rows } = await db.query<{ total: string }>(
    `select coalesce(sum(value), 0.00)::text as total
     from bills
     where recurrence_id is not null and paid = false and term between $1 and $2`,
    [from, to],
  );
  return rows[0]?.total ?? "0.00";
}

export async function findBillVarianceByRecurrenceId(
  db: Pool | PoolClient,
  recurrenceId: string,
): Promise<RecurrenceVarianceRow[]> {
  const { rows } = await db.query<RecurrenceVarianceRow>(
    `select
       to_char(b.term, 'YYYY-MM-DD') as date,
       b.value::text as bill_value,
       r.is_variable,
       r.estimated_value::text as estimated_value,
       t.amount::text as actual_amount
     from bills b
     join recurrences r on r.id = b.recurrence_id
     left join transactions t on t.to_type = 'bill' and t.to_id = b.id
     where b.recurrence_id = $1
     order by b.term asc`,
    [recurrenceId],
  );
  return rows;
}

export async function findRevenueVarianceByRecurrenceId(
  db: Pool | PoolClient,
  recurrenceId: string,
): Promise<RecurrenceVarianceRow[]> {
  const { rows } = await db.query<RecurrenceVarianceRow>(
    `select
       to_char(rv.term, 'YYYY-MM-DD') as date,
       rv.value::text as bill_value,
       r.is_variable,
       r.estimated_value::text as estimated_value,
       t.amount::text as actual_amount
     from revenues rv
     join recurrences r on r.id = rv.recurrence_id
     left join transactions t on t.from_type = 'revenue' and t.from_id = rv.id
     where rv.recurrence_id = $1
     order by rv.term asc`,
    [recurrenceId],
  );
  return rows;
}

export async function updateRecurrence(
  db: Pool | PoolClient,
  id: string,
  fields: {
    intervalUnit?: IntervalUnit;
    intervalValue?: number;
    isVariable?: boolean;
    recurrentDay?: number;
    recurrentMonth?: number | null;
  },
): Promise<RecurrenceRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.intervalUnit !== undefined) { values.push(fields.intervalUnit); sets.push(`interval_unit = $${values.length}`); }
  if (fields.intervalValue !== undefined) { values.push(fields.intervalValue); sets.push(`interval_value = $${values.length}`); }
  if (fields.isVariable !== undefined) { values.push(fields.isVariable); sets.push(`is_variable = $${values.length}`); }
  if (fields.recurrentDay !== undefined) { values.push(fields.recurrentDay); sets.push(`recurrent_day = $${values.length}`); }
  if ("recurrentMonth" in fields) { values.push(fields.recurrentMonth ?? null); sets.push(`recurrent_month = $${values.length}`); }

  if (sets.length === 0) return findRecurrenceById(db, id);

  values.push(id);
  const { rows } = await db.query<RecurrenceRow>(
    `update recurrences set ${sets.join(", ")} where id = $${values.length} returning *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteRecurrence(db: Pool | PoolClient, id: string): Promise<void> {
  await db.query(`delete from recurrences where id = $1`, [id]);
}
