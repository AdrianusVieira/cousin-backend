import { pool } from "../../db/pool.js";
import { subtractMonths, toISODate, today } from "../../lib/date.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { computeNextTerm, computeRecurrenceValueUpdate, lookaheadCount } from "../../lib/recurrences.js";
import {
  createRecurrence,
  findRecurrenceById,
  updateRecurrenceEstimatedValue,
} from "../recurrences/recurrences.repository.js";
import { findLinkedTransactionForRevenue } from "../transactions/transactions.repository.js";
import { mapFullTransaction } from "../transactions/transactions.types.js";
import type { CreateRevenueInput, PatchRevenueInput } from "./revenues.schema.js";
import {
  createRevenue as createRevenueRow,
  deleteRevenueById,
  findAllRevenues,
  findRevenueById,
  findRevenuesByRecurrenceId,
  findRevenueSummary,
  updateRevenue,
  updateRevenuesValueByIds,
} from "./revenues.repository.js";
import { rowToRevenue, type Revenue } from "./revenues.types.js";

function defaultPeriod(range: { from?: string; to?: string }) {
  const to = range.to ?? toISODate(today());
  const from = range.from ?? toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));
  return { from, to };
}

export async function listRevenues(filter: {
  from?: string;
  to?: string;
  status?: "all" | "pending" | "received" | "overdue";
  active?: boolean;
}) {
  const { from, to } = defaultPeriod(filter);
  const todayStr = toISODate(today());

  const [summary, rows] = await Promise.all([
    findRevenueSummary(pool, { from, to }),
    findAllRevenues(pool, { from, to, status: filter.status, active: filter.active }),
  ]);

  return {
    summary: {
      totalExpected: summary.total_expected ?? "0.00",
      totalReceived: summary.total_received ?? "0.00",
      totalPending: summary.total_pending ?? "0.00",
      overdue: summary.overdue ?? "0.00",
    },
    items: rows.map((r) => rowToRevenue(r, todayStr)),
  };
}

export async function getRevenueDetail(id: string) {
  const todayStr = toISODate(today());
  const row = await findRevenueById(pool, id);
  if (!row) throw new NotFoundError("Revenue not found");

  const revenue = rowToRevenue(row, todayStr);

  const [instanceRows, linkedTxnRow] = await Promise.all([
    row.recurrence_id
      ? findRevenuesByRecurrenceId(pool, row.recurrence_id)
      : Promise.resolve([row]),
    findLinkedTransactionForRevenue(pool, id),
  ]);

  return {
    revenue,
    instances: instanceRows.map((r) => rowToRevenue(r, todayStr)),
    linkedTransaction: linkedTxnRow ? mapFullTransaction(linkedTxnRow) : null,
  };
}

export async function createRevenue(input: CreateRevenueInput): Promise<Revenue> {
  const todayStr = toISODate(today());

  if (!input.recurrence) {
    const row = await createRevenueRow(pool, {
      name: input.name,
      value: input.value,
      term: input.term,
      sourceId: input.sourceId,
      description: input.description,
    });
    return rowToRevenue({ ...row, has_linked_transaction: false }, todayStr);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const recurrence = await createRecurrence(client, {
      isVariable: input.recurrence.isVariable,
      intervalUnit: input.recurrence.intervalUnit,
      intervalValue: input.recurrence.intervalValue,
      recurrentDay: input.recurrence.recurrentDay,
      recurrentMonth: input.recurrence.recurrentMonth,
      estimatedValue: input.recurrence.isVariable ? input.value : undefined,
    });

    const commonFields = {
      name: input.name,
      value: input.value,
      sourceId: input.sourceId,
      description: input.description,
      recurrenceId: recurrence.id,
    };

    const firstRow = await createRevenueRow(client, { ...commonFields, term: input.term });

    const count = lookaheadCount(input.recurrence.intervalUnit);
    let prevTerm = input.term;
    for (let i = 0; i < count; i++) {
      prevTerm = computeNextTerm(prevTerm, input.recurrence);
      await createRevenueRow(client, { ...commonFields, term: prevTerm });
    }

    await client.query("commit");
    return rowToRevenue({ ...firstRow, has_linked_transaction: false }, todayStr);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function patchRevenue(id: string, input: PatchRevenueInput): Promise<Revenue> {
  const todayStr = toISODate(today());
  const existing = await findRevenueById(pool, id);
  if (!existing) throw new NotFoundError("Revenue not found");

  const valueChanged = input.value !== undefined && input.value !== existing.value;
  const recurrence =
    existing.recurrence_id && valueChanged
      ? await findRecurrenceById(pool, existing.recurrence_id)
      : null;

  if (!recurrence?.is_variable) {
    await updateRevenue(pool, id, input);
    const updated = await findRevenueById(pool, id);
    return rowToRevenue(updated!, todayStr);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    await updateRevenue(client, id, input);
    const siblings = await findRevenuesByRecurrenceId(client, existing.recurrence_id!);
    const { estimatedValue, propagateIds } = computeRecurrenceValueUpdate(
      siblings.map((s) => ({ id: s.id, isPaid: s.received, term: s.term, value: s.value })),
      id,
    );

    await updateRecurrenceEstimatedValue(client, existing.recurrence_id!, estimatedValue);
    await updateRevenuesValueByIds(client, propagateIds, estimatedValue);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const updated = await findRevenueById(pool, id);
  return rowToRevenue(updated!, todayStr);
}

export async function deleteRevenue(id: string): Promise<void> {
  const existing = await findRevenueById(pool, id);
  if (!existing) throw new NotFoundError("Revenue not found");

  if (existing.received) {
    throw new ConflictError("DELETE_BLOCKED", "Cannot delete a received revenue");
  }

  await deleteRevenueById(pool, id);
}
