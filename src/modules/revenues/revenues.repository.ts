import type { Pool, PoolClient } from "pg";
import type { RevenueRow, RevenueWithMeta } from "./revenues.types.js";

const revenueSelect = `
  select
    r.id, r.name, r.description, r.value::text as value,
    to_char(r.term, 'YYYY-MM-DD') as term,
    r.received, r.source_id, r.recurrence_id, r.created_at, r.updated_at,
    exists(
      select 1 from transactions t where t.from_type = 'revenue' and t.from_id = r.id
    ) as has_linked_transaction
  from revenues r`;

export interface RevenueListFilter {
  from: string;
  to: string;
  status?: "all" | "pending" | "received" | "overdue";
  active?: boolean;
}

export interface RevenueSummaryRow {
  total_expected: string;
  total_received: string;
  total_pending: string;
  overdue: string;
}

export async function findRevenueSummary(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<RevenueSummaryRow> {
  const { rows } = await db.query<RevenueSummaryRow>(
    `select
       sum(value)::text as total_expected,
       sum(case when received then value else 0.00 end)::text as total_received,
       sum(case when not received then value else 0.00 end)::text as total_pending,
       sum(case when not received and term < current_date then value else 0.00 end)::text as overdue
     from revenues
     where term between $1 and $2`,
    [from, to],
  );
  return rows[0]!;
}

export async function findAllRevenues(
  db: Pool | PoolClient,
  filter: RevenueListFilter,
): Promise<RevenueWithMeta[]> {
  const conditions: string[] = ["r.term between $1 and $2"];
  const values: unknown[] = [filter.from, filter.to];

  if (filter.active === true || filter.status === "pending") {
    conditions.push("r.received = false");
  } else if (filter.status === "received") {
    conditions.push("r.received = true");
  } else if (filter.status === "overdue") {
    conditions.push("r.received = false and r.term < current_date");
  }

  const where = `where ${conditions.join(" and ")}`;
  const { rows } = await db.query<RevenueWithMeta>(
    `${revenueSelect} ${where} order by r.term asc`,
    values,
  );
  return rows;
}

export async function findRevenueById(
  db: Pool | PoolClient,
  id: string,
): Promise<RevenueWithMeta | null> {
  const { rows } = await db.query<RevenueWithMeta>(
    `${revenueSelect} where r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findRevenuesBySourceId(
  db: Pool | PoolClient,
  sourceId: string,
  { from, to }: { from: string; to: string },
): Promise<RevenueWithMeta[]> {
  const { rows } = await db.query<RevenueWithMeta>(
    `${revenueSelect} where r.source_id = $1 and r.term between $2 and $3 order by r.term asc`,
    [sourceId, from, to],
  );
  return rows;
}

export async function findRevenuesByRecurrenceId(
  db: Pool | PoolClient,
  recurrenceId: string,
): Promise<RevenueWithMeta[]> {
  const { rows } = await db.query<RevenueWithMeta>(
    `${revenueSelect} where r.recurrence_id = $1 order by r.term asc`,
    [recurrenceId],
  );
  return rows;
}

export interface CreateRevenueRow {
  name: string;
  value: string;
  term: string;
  sourceId: string;
  description?: string;
  recurrenceId?: string;
}

export async function createRevenue(
  db: Pool | PoolClient,
  input: CreateRevenueRow,
): Promise<RevenueRow> {
  const { rows } = await db.query<RevenueRow>(
    `insert into revenues (name, value, term, source_id, description, recurrence_id)
     values ($1, $2, $3, $4, $5, $6)
     returning id, name, description, value::text as value,
       to_char(term, 'YYYY-MM-DD') as term,
       received, source_id, recurrence_id, created_at, updated_at`,
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

export async function updateRevenue(
  db: Pool | PoolClient,
  id: string,
  fields: {
    name?: string;
    value?: string;
    term?: string;
    description?: string;
    received?: boolean;
  },
): Promise<RevenueRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) { values.push(fields.name); sets.push(`name = $${values.length}`); }
  if (fields.value !== undefined) { values.push(fields.value); sets.push(`value = $${values.length}`); }
  if (fields.term !== undefined) { values.push(fields.term); sets.push(`term = $${values.length}`); }
  if ("description" in fields) { values.push(fields.description ?? null); sets.push(`description = $${values.length}`); }
  if (fields.received !== undefined) { values.push(fields.received); sets.push(`received = $${values.length}`); }

  values.push(id);
  const { rows } = await db.query<RevenueRow>(
    `update revenues set ${sets.join(", ")} where id = $${values.length}
     returning id, name, description, value::text as value,
       to_char(term, 'YYYY-MM-DD') as term,
       received, source_id, recurrence_id, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteRevenueById(db: Pool | PoolClient, id: string): Promise<void> {
  await db.query(`delete from revenues where id = $1`, [id]);
}

export async function updateRevenuesValueByIds(
  db: Pool | PoolClient,
  ids: string[],
  value: string,
): Promise<void> {
  if (ids.length === 0) return;
  await db.query(`update revenues set value = $1 where id = any($2::uuid[])`, [value, ids]);
}
