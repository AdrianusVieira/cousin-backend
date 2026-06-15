import type { Pool, PoolClient } from "pg";
import type { CreateSourceInput } from "./sources.schema.js";
import type { SourceDetailRow, SourceListRow, SourceRow } from "./sources.types.js";

const hasOpenItemsExpr = `(
  exists(select 1 from bills b where b.source_id = s.id and b.paid = false)
  or exists(select 1 from revenues r where r.source_id = s.id and r.received = false)
)`;

export async function findAllSources(
  db: Pool | PoolClient,
  { from, to }: { from: string; to: string },
): Promise<SourceListRow[]> {
  const { rows } = await db.query<SourceListRow>(
    `select
       s.id, s.name, s.description, s.archived, s.created_at, s.updated_at,
       ${hasOpenItemsExpr} as has_open_items,
       rev.income,
       bill.outcome
     from sources s
     left join (
       select source_id, sum(value)::text as income
       from revenues
       where term between $1 and $2
       group by source_id
     ) rev on rev.source_id = s.id
     left join (
       select source_id, sum(value)::text as outcome
       from bills
       where term between $1 and $2
       group by source_id
     ) bill on bill.source_id = s.id
     order by s.created_at asc`,
    [from, to],
  );
  return rows;
}

export async function findSourceById(
  db: Pool | PoolClient,
  id: string,
): Promise<SourceDetailRow | null> {
  const { rows } = await db.query<SourceDetailRow>(
    `select
       s.id, s.name, s.description, s.archived, s.created_at, s.updated_at,
       ${hasOpenItemsExpr} as has_open_items
     from sources s
     where s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createSource(
  db: Pool | PoolClient,
  input: CreateSourceInput,
): Promise<SourceRow> {
  const { rows } = await db.query<SourceRow>(
    `insert into sources (name, description) values ($1, $2) returning *`,
    [input.name, input.description ?? null],
  );
  return rows[0]!;
}

export async function updateSource(
  db: Pool | PoolClient,
  id: string,
  fields: { name?: string; description?: string },
): Promise<SourceRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    values.push(fields.name);
    sets.push(`name = $${values.length}`);
  }
  if (fields.description !== undefined) {
    values.push(fields.description);
    sets.push(`description = $${values.length}`);
  }

  values.push(id);
  const { rows } = await db.query<SourceRow>(
    `update sources set ${sets.join(", ")} where id = $${values.length} returning *`,
    values,
  );
  return rows[0] ?? null;
}

export async function setSourceArchived(
  db: Pool | PoolClient,
  id: string,
  archived: boolean,
): Promise<SourceRow | null> {
  const { rows } = await db.query<SourceRow>(
    `update sources set archived = $1 where id = $2 returning *`,
    [archived, id],
  );
  return rows[0] ?? null;
}
