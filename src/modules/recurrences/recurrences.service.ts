import { pool } from "../../db/pool.js";
import { toISODate, today } from "../../lib/date.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { computeEstimateFromPast } from "../../lib/recurrences.js";
import {
  findBillsByRecurrenceId,
  updateBillsValueByIds,
} from "../bills/bills.repository.js";
import { rowToBill } from "../bills/bills.types.js";
import {
  findRevenuesByRecurrenceId,
  updateRevenuesValueByIds,
} from "../revenues/revenues.repository.js";
import { rowToRevenue } from "../revenues/revenues.types.js";
import {
  deleteRecurrence,
  findAllRecurrencesWithMeta,
  findBillVarianceByRecurrenceId,
  findRecurrenceById,
  findRecurringOutflow,
  findRevenueVarianceByRecurrenceId,
  updateRecurrence,
  updateRecurrenceEstimatedValue,
  type RecurrenceVarianceRow,
} from "./recurrences.repository.js";
import type { PatchRecurrenceInput } from "./recurrences.schema.js";
import { rowToRecurrence } from "./recurrences.types.js";

function varianceEntry(row: RecurrenceVarianceRow, currentTerm: string | undefined) {
  const estimated =
    row.is_variable && row.estimated_value ? row.estimated_value : row.bill_value;

  // Settled instances plot their recorded value on the actual line; the current
  // (nearest upcoming) instance also plots its value even when unpaid, so its
  // vital amount is visible against the estimate instead of leaving a gap.
  const showActual = row.settled || row.date === currentTerm;
  return { date: row.date, estimated, actual: showActual ? row.bill_value : null };
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

  const currentTerm = varianceRows
    .map((v) => v.date)
    .filter((d) => d >= todayStr)
    .sort()[0];

  return {
    recurrence: rowToRecurrence(row, active),
    name,
    type,
    instances,
    variance: varianceRows.map((v) => varianceEntry(v, currentTerm)),
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

export async function recomputeRecurrenceEstimate(id: string): Promise<void> {
  const recurrence = await findRecurrenceById(pool, id);
  if (!recurrence) throw new NotFoundError("Recurrence not found");
  if (!recurrence.is_variable) {
    throw new ConflictError(
      "NOT_VARIABLE",
      "Estimate can only be recomputed for variable recurrences",
    );
  }

  const todayStr = toISODate(today());
  const [billInstances, revenueInstances] = await Promise.all([
    findBillsByRecurrenceId(pool, id),
    findRevenuesByRecurrenceId(pool, id),
  ]);
  const isBill = billInstances.length > 0;

  const instances = isBill
    ? billInstances.map((b) => ({ id: b.id, isPaid: b.paid, term: b.term, value: b.value }))
    : revenueInstances.map((r) => ({ id: r.id, isPaid: r.received, term: r.term, value: r.value }));

  const { estimatedValue, propagateIds } = computeEstimateFromPast(instances, todayStr);
  if (estimatedValue === null) return;

  const client = await pool.connect();
  try {
    await client.query("begin");

    await updateRecurrenceEstimatedValue(client, id, estimatedValue);
    if (isBill) {
      await updateBillsValueByIds(client, propagateIds, estimatedValue);
    } else {
      await updateRevenuesValueByIds(client, propagateIds, estimatedValue);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateRecurrence(id: string): Promise<void> {
  const existing = await findRecurrenceById(pool, id);
  if (!existing) throw new NotFoundError("Recurrence not found");

  await deleteRecurrence(pool, id);
}
