import type { Pool, PoolClient } from "pg";
import type { CreateCategoryInput } from "./categories.schema.js";
import type { CategoryListRow, CategoryRow } from "./categories.types.js";

const txnIncomeOutcome = `
  select
    category_id,
    sum(case when from_type in ('external','revenue') and to_type = 'wallet' then amount else 0.00 end)::text as income,
    sum(case when from_type = 'wallet' and to_type in ('external','bill') then amount else 0.00 end)::text as outcome
  from transactions
  where date between $1 and $2
    and category_id is not null
  group by category_id`;

export async function findAllCategories(
  db: Pool | PoolClient,
  { from, to, active }: { from: string; to: string; active?: boolean },
): Promise<CategoryListRow[]> {
  const conditions: string[] = [];
  if (active === true) conditions.push("c.archived = false");
  if (active === false) conditions.push("c.archived = true");
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const { rows } = await db.query<CategoryListRow>(
    `select
       c.id, c.name, c.description, c.archived, c.created_at, c.updated_at,
       txn.income,
       txn.outcome
     from categories c
     left join (${txnIncomeOutcome}) txn on txn.category_id = c.id
     ${where}
     order by c.created_at asc`,
    [from, to],
  );
  return rows;
}

export async function findCategoryById(
  db: Pool | PoolClient,
  id: string,
): Promise<CategoryRow | null> {
  const { rows } = await db.query<CategoryRow>(
    `select * from categories where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findCategoryBreakdown(
  db: Pool | PoolClient,
  id: string,
  { from, to, granularity }: { from: string; to: string; granularity: "week" | "month" },
): Promise<Array<{ bucket: string; income: string | null; outcome: string | null }>> {
  const bucket = granularity === "week" ? "week" : "month";
  const { rows } = await db.query<{
    bucket: string;
    income: string | null;
    outcome: string | null;
  }>(
    `select
       date_trunc('${bucket}', date)::text as bucket,
       sum(case when from_type in ('external','revenue') and to_type = 'wallet' then amount else 0.00 end)::text as income,
       sum(case when from_type = 'wallet' and to_type in ('external','bill') then amount else 0.00 end)::text as outcome
     from transactions
     where category_id = $1
       and date between $2 and $3
     group by date_trunc('${bucket}', date)
     order by bucket asc`,
    [id, from, to],
  );
  return rows;
}

export async function createCategory(
  db: Pool | PoolClient,
  input: CreateCategoryInput,
): Promise<CategoryRow> {
  const { rows } = await db.query<CategoryRow>(
    `insert into categories (name, description) values ($1, $2) returning *`,
    [input.name, input.description ?? null],
  );
  return rows[0]!;
}

export async function updateCategory(
  db: Pool | PoolClient,
  id: string,
  fields: { name?: string; description?: string },
): Promise<CategoryRow | null> {
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
  const { rows } = await db.query<CategoryRow>(
    `update categories set ${sets.join(", ")} where id = $${values.length} returning *`,
    values,
  );
  return rows[0] ?? null;
}

export async function setCategoryArchived(
  db: Pool | PoolClient,
  id: string,
  archived: boolean,
): Promise<CategoryRow | null> {
  const { rows } = await db.query<CategoryRow>(
    `update categories set archived = $1 where id = $2 returning *`,
    [archived, id],
  );
  return rows[0] ?? null;
}
