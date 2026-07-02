import { pool } from "../../db/pool.js";
import { subtractMonths, toISODate, today } from "../../lib/date.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { computeNextTerm, computeRecurrenceValueUpdate, lookaheadCount } from "../../lib/recurrences.js";
import {
  createRecurrence,
  findRecurrenceById,
  updateRecurrenceEstimatedValue,
} from "../recurrences/recurrences.repository.js";
import { findLinkedTransactionForBill } from "../transactions/transactions.repository.js";
import { mapFullTransaction } from "../transactions/transactions.types.js";
import type { CreateBillInput, PatchBillInput } from "./bills.schema.js";
import {
  createBill as createBillRow,
  deleteBillById,
  findAllBills,
  findBillById,
  findBillsByRecurrenceId,
  findBillSummary,
  updateBill,
  updateBillsValueByIds,
} from "./bills.repository.js";
import { rowToBill, type Bill } from "./bills.types.js";

function defaultPeriod(range: { from?: string; to?: string }) {
  const to = range.to ?? toISODate(today());
  const from = range.from ?? toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));
  return { from, to };
}

export async function listBills(filter: {
  from?: string;
  to?: string;
  status?: "all" | "unpaid" | "paid" | "overdue";
  active?: boolean;
}) {
  const { from, to } = defaultPeriod(filter);
  const todayStr = toISODate(today());

  const [summary, rows] = await Promise.all([
    findBillSummary(pool, { from, to }),
    findAllBills(pool, { from, to, status: filter.status, active: filter.active }),
  ]);

  return {
    summary: {
      totalBilled: summary.total_billed ?? "0.00",
      totalPaid: summary.total_paid ?? "0.00",
      totalUnpaid: summary.total_unpaid ?? "0.00",
      overdue: summary.overdue ?? "0.00",
    },
    items: rows.map((r) => rowToBill(r, todayStr)),
  };
}

export async function getBillDetail(id: string) {
  const todayStr = toISODate(today());
  const row = await findBillById(pool, id);
  if (!row) throw new NotFoundError("Bill not found");

  const bill = rowToBill(row, todayStr);

  const [instanceRows, linkedTxnRow] = await Promise.all([
    row.recurrence_id
      ? findBillsByRecurrenceId(pool, row.recurrence_id)
      : Promise.resolve([row]),
    findLinkedTransactionForBill(pool, id),
  ]);

  return {
    bill,
    instances: instanceRows.map((r) => rowToBill(r, todayStr)),
    linkedTransaction: linkedTxnRow ? mapFullTransaction(linkedTxnRow) : null,
  };
}

export async function createBill(input: CreateBillInput): Promise<Bill> {
  const todayStr = toISODate(today());

  if (!input.recurrence) {
    const row = await createBillRow(pool, {
      name: input.name,
      value: input.value,
      term: input.term,
      sourceId: input.sourceId,
      description: input.description,
    });
    return rowToBill({ ...row, has_linked_transaction: false }, todayStr);
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

    const firstRow = await createBillRow(client, { ...commonFields, term: input.term });

    const count = lookaheadCount(input.recurrence.intervalUnit);
    let prevTerm = input.term;
    for (let i = 0; i < count; i++) {
      prevTerm = computeNextTerm(prevTerm, input.recurrence);
      await createBillRow(client, { ...commonFields, term: prevTerm });
    }

    await client.query("commit");
    return rowToBill({ ...firstRow, has_linked_transaction: false }, todayStr);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function patchBill(id: string, input: PatchBillInput): Promise<Bill> {
  const todayStr = toISODate(today());
  const existing = await findBillById(pool, id);
  if (!existing) throw new NotFoundError("Bill not found");

  const valueChanged = input.value !== undefined && input.value !== existing.value;
  const recurrence =
    existing.recurrence_id && valueChanged
      ? await findRecurrenceById(pool, existing.recurrence_id)
      : null;

  if (!recurrence?.is_variable) {
    await updateBill(pool, id, input);
    const updated = await findBillById(pool, id);
    return rowToBill(updated!, todayStr);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    await updateBill(client, id, input);
    const siblings = await findBillsByRecurrenceId(client, existing.recurrence_id!);
    const { estimatedValue, propagateIds } = computeRecurrenceValueUpdate(
      siblings.map((s) => ({ id: s.id, isPaid: s.paid, term: s.term, value: s.value })),
      id,
    );

    await updateRecurrenceEstimatedValue(client, existing.recurrence_id!, estimatedValue);
    await updateBillsValueByIds(client, propagateIds, estimatedValue);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const updated = await findBillById(pool, id);
  return rowToBill(updated!, todayStr);
}

export async function deleteBill(id: string): Promise<void> {
  const existing = await findBillById(pool, id);
  if (!existing) throw new NotFoundError("Bill not found");

  if (existing.paid) {
    throw new ConflictError("DELETE_BLOCKED", "Cannot delete a paid bill");
  }

  await deleteBillById(pool, id);
}
