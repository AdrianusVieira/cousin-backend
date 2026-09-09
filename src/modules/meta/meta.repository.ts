import type { Pool, PoolClient } from "pg";
import { META_ENTITY, type LastUpdatedRow } from "./meta.types.js";

// Entity names double as table names, so the projection derives from META_ENTITY
// rather than repeating the list. No user input reaches this string.
const lastUpdatedColumns = Object.values(META_ENTITY)
  .map((entity) => `(select max(updated_at) from ${entity}) as ${entity}`)
  .join(",\n       ");

export async function findLastUpdated(db: Pool | PoolClient): Promise<LastUpdatedRow> {
  const { rows } = await db.query<LastUpdatedRow>(`select ${lastUpdatedColumns}`);
  return rows[0]!;
}
