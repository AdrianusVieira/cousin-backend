import { pool } from "../../db/pool.js";
import { toISODate, today } from "../../lib/date.js";
import { NotFoundError } from "../../lib/errors.js";
import { findBillsByRecurrenceId } from "../bills/bills.repository.js";
import { rowToBill } from "../bills/bills.types.js";
import { findRevenuesByRecurrenceId } from "../revenues/revenues.repository.js";
import { rowToRevenue } from "../revenues/revenues.types.js";
import {
  deleteRecurrence,
  findAllRecurrencesWithMeta,
  findBillVarianceByRecurrenceId,
  findRecurrenceById,
  findRecurringOutflow,
  findRevenueVarianceByRecurrenceId,
  updateRecurrence,
  type RecurrenceVarianceRow,
} from "./recurrences.repository.js";
import type { PatchRecurrenceInput } from "./recurrences.schema.js";
import { rowToRecurrence } from "./recurrences.types.js";

function varianceEntry(row: RecurrenceVarianceRow) {
  const estimated =
    row.is_variable && row.estimated_value ? row.estimated_value : row.bill_value;
  return { date: row.date, estimated, actual: row.actual_amount ?? null };
}

export async function listRecurrences(query: { from?: string; to?: string }) {
  const now = today();
  const to =
    query.to ??
    toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const from =
    query.from ??
    toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

  const [rows, recurringOutflow] = await Promise.all([
    findAllRecurrencesWithMeta(pool),
    findRecurringOutflow(pool, { from, to }),
  ]);

  let activeCount = 0;
  let inactiveCount = 0;

  const items = rows.map((row) => {
    const active = row.next_instance !== null;
    if (active) activeCount++;
    else inactiveCount++;

    return {
      ...rowToRecurrence(row, active),
      name: row.name ?? "",
      type: (row.type ?? "bill") as "bill" | "revenue",
      nextInstance: row.next_instance,
    };
  });

  return {
    summary: { recurringOutflow, activeCount, inactiveCount },
    items,
  };
}

export async function getRecurrenceDetail(id: string) {
  const todayStr = toISODate(today());
  const row = await findRecurrenceById(pool, id);
  if (!row) throw new NotFoundError("Recurrence not found");

  const [billInstances, revenueInstances] = await Promise.all([
    findBillsByRecurrenceId(pool, id),
    findRevenuesByRecurrenceId(pool, id),
  ]);

  const isBill = billInstances.length > 0;
  const type: "bill" | "revenue" = isBill ? "bill" : "revenue";

  const varianceRows = isBill
    ? await findBillVarianceByRecurrenceId(pool, id)
    : await findRevenueVarianceByRecurrenceId(pool, id);

  const active =
    isBill
      ? billInstances.some((b) => b.term >= todayStr)
      : revenueInstances.some((r) => r.term >= todayStr);

  const name = isBill
    ? (billInstances.at(-1)?.name ?? "")
    : (revenueInstances.at(-1)?.name ?? "");

  const instances = isBill
    ? billInstances.map((b) => rowToBill(b, todayStr))
    : revenueInstances.map((r) => rowToRevenue(r, todayStr));

  return {
    recurrence: rowToRecurrence(row, active),
    name,
    type,
    instances,
    variance: varianceRows.map(varianceEntry),
  };
}

export async function patchRecurrenceConfig(
  id: string,
  input: PatchRecurrenceInput,
) {
  const existing = await findRecurrenceById(pool, id);
  if (!existing) throw new NotFoundError("Recurrence not found");

  const updated = await updateRecurrence(pool, id, input);

  const todayStr = toISODate(today());
  const [billInstances, revenueInstances] = await Promise.all([
    findBillsByRecurrenceId(pool, id),
    findRevenuesByRecurrenceId(pool, id),
  ]);
  const active =
    billInstances.some((b) => b.term >= todayStr) ||
    revenueInstances.some((r) => r.term >= todayStr);

  return rowToRecurrence(updated!, active);
}

export async function deactivateRecurrence(id: string): Promise<void> {
  const existing = await findRecurrenceById(pool, id);
  if (!existing) throw new NotFoundError("Recurrence not found");

  await deleteRecurrence(pool, id);
}
