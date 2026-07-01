import type { Pool, PoolClient } from "pg";
import type { BillRow, BillWithMeta } from "./bills.types.js";

const billSelect = `
  select
    b.id, b.name, b.description, b.value::text as value,
    to_char(b.term, 'YYYY-MM-DD') as term,
    b.paid, b.source_id, b.recurrence_id, b.created_at, b.updated_at,
    exists(
      select 1 from transactions t where t.to_type = 'bill' and t.to_id = b.id
    ) as has_linked_transaction
  from bills b`;

export interface BillListFilter {
  from: string;
  to: string;
  status?: "all" | "unpaid" | "paid" | "overdue";
  active?: boolean;
}

export interface BillSummaryRow {
  total_billed: string;
  total_paid: string;
  total_unpaid: string;
  overdue: string;
}

export async function findBillSummary(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<BillSummaryRow> {
  const { rows } = await db.query<BillSummaryRow>(
    `select
       sum(value)::text as total_billed,
       sum(case when paid then value else 0.00 end)::text as total_paid,
       sum(case when not paid then value else 0.00 end)::text as total_unpaid,
       sum(case when not paid and term < current_date then value else 0.00 end)::text as overdue
     from bills
     where term between $1 and $2`,
    [from, to],
  );
  return rows[0]!;
}

export async function findAllBills(
  db: Pool | PoolClient,
  filter: BillListFilter,
): Promise<BillWithMeta[]> {
  const conditions: string[] = ["b.term between $1 and $2"];
  const values: unknown[] = [filter.from, filter.to];

  if (filter.active === true || filter.status === "unpaid") {
    conditions.push("b.paid = false");
  } else if (filter.status === "paid") {
    conditions.push("b.paid = true");
  } else if (filter.status === "overdue") {
    conditions.push("b.paid = false and b.term < current_date");
  }

  const where = `where ${conditions.join(" and ")}`;
  const { rows } = await db.query<BillWithMeta>(
    `${billSelect} ${where} order by b.term asc`,
    values,
  );
  return rows;
}

export async function findBillById(
  db: Pool | PoolClient,
  id: string,
): Promise<BillWithMeta | null> {
  const { rows } = await db.query<BillWithMeta>(
    `${billSelect} where b.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findBillsBySourceId(
  db: Pool | PoolClient,
  sourceId: string,
  { from, to }: { from: string; to: string },
): Promise<BillWithMeta[]> {
  const { rows } = await db.query<BillWithMeta>(
    `${billSelect} where b.source_id = $1 and b.term between $2 and $3 order by b.term asc`,
    [sourceId, from, to],
  );
  return rows;
}

export async function findBillsByRecurrenceId(
  db: Pool | PoolClient,
  recurrenceId: string,
): Promise<BillWithMeta[]> {
  const { rows } = await db.query<BillWithMeta>(
    `${billSelect} where b.recurrence_id = $1 order by b.term asc`,
    [recurrenceId],
  );
  return rows;
}

export interface CreateBillRow {
  name: string;
  value: string;
  term: string;
  sourceId: string;
  description?: string;
  recurrenceId?: string;
}

export async function createBill(
  db: Pool | PoolClient,
  input: CreateBillRow,
): Promise<BillRow> {
  const { rows } = await db.query<BillRow>(
    `insert into bills (name, value, term, source_id, description, recurrence_id)
     values ($1, $2, $3, $4, $5, $6)
     returning id, name, description, value::text as value,
       to_char(term, 'YYYY-MM-DD') as term,
       paid, source_id, recurrence_id, created_at, updated_at`,
    [
      input.name,
      input.value,
      input.term,
      input.sourceId,
      input.description ?? null,
      input.recurrenceId ?? null,
    ],
  );
  return rows[0]!;
}

export async function updateBill(
  db: Pool | PoolClient,
  id: string,
  fields: { name?: string; value?: string; term?: string; description?: string; paid?: boolean },
): Promise<BillRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) { values.push(fields.name); sets.push(`name = $${values.length}`); }
  if (fields.value !== undefined) { values.push(fields.value); sets.push(`value = $${values.length}`); }
  if (fields.term !== undefined) { values.push(fields.term); sets.push(`term = $${values.length}`); }
  if ("description" in fields) { values.push(fields.description ?? null); sets.push(`description = $${values.length}`); }
  if (fields.paid !== undefined) { values.push(fields.paid); sets.push(`paid = $${values.length}`); }

  values.push(id);
  const { rows } = await db.query<BillRow>(
    `update bills set ${sets.join(", ")} where id = $${values.length}
     returning id, name, description, value::text as value,
       to_char(term, 'YYYY-MM-DD') as term,
       paid, source_id, recurrence_id, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteBillById(db: Pool | PoolClient, id: string): Promise<void> {
  await db.query(`delete from bills where id = $1`, [id]);
}

export async function updateBillsValueByIds(
  db: Pool | PoolClient,
  ids: string[],
  value: string,
): Promise<void> {
  if (ids.length === 0) return;
  await db.query(`update bills set value = $1 where id = any($2::uuid[])`, [value, ids]);
}
