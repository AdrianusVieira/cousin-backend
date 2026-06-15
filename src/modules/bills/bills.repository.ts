import type { Pool, PoolClient } from "pg";
import type { BillWithMeta } from "./bills.types.js";

export async function findBillsBySourceId(
  db: Pool | PoolClient,
  sourceId: string,
  { from, to }: { from: string; to: string },
): Promise<BillWithMeta[]> {
  const { rows } = await db.query<BillWithMeta>(
    `select b.id, b.name, b.description, b.value::text as value,
       to_char(b.term, 'YYYY-MM-DD') as term,
       b.paid, b.source_id, b.recurrence_id, b.created_at, b.updated_at,
       exists(
         select 1 from transactions t
         where t.to_type = 'bill' and t.to_id = b.id
       ) as has_linked_transaction
     from bills b
     where b.source_id = $1
       and b.term between $2 and $3
     order by b.term asc`,
    [sourceId, from, to],
  );
  return rows;
}
