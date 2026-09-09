import { pool } from "../../db/pool.js";
import { findLastUpdated } from "./meta.repository.js";
import { rowToLastUpdated, type LastUpdated } from "./meta.types.js";

export async function getLastUpdated(): Promise<LastUpdated> {
  const row = await findLastUpdated(pool);
  return rowToLastUpdated(row);
}
