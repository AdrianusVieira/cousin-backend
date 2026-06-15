import type { Pool, PoolClient } from "pg";
import type { IntervalUnit } from "../../lib/recurrences.js";
import type { RecurrenceRow } from "./recurrences.types.js";

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
