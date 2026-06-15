import type { Pool, PoolClient } from "pg";
import type { RevenueWithMeta } from "./revenues.types.js";

export async function findRevenuesBySourceId(
  db: Pool | PoolClient,
  sourceId: string,
  { from, to }: { from: string; to: string },
): Promise<RevenueWithMeta[]> {
  const { rows } = await db.query<RevenueWithMeta>(
    `select r.id, r.name, r.description, r.value::text as value,
       to_char(r.term, 'YYYY-MM-DD') as term,
       r.received, r.source_id, r.recurrence_id, r.created_at, r.updated_at,
       exists(
         select 1 from transactions t
         where t.from_type = 'revenue' and t.from_id = r.id
       ) as has_linked_transaction
     from revenues r
     where r.source_id = $1
       and r.term between $2 and $3
     order by r.term asc`,
    [sourceId, from, to],
  );
  return rows;
}
