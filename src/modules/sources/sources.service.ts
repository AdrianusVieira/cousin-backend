import { pool } from "../../db/pool.js";
import { subtractMonths, toISODate, today } from "../../lib/date.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { fromCents, toCents } from "../../lib/money.js";
import { findBillsBySourceId } from "../bills/bills.repository.js";
import { rowToBill } from "../bills/bills.types.js";
import { findRevenuesBySourceId } from "../revenues/revenues.repository.js";
import { rowToRevenue } from "../revenues/revenues.types.js";
import type { CreateSourceInput, PatchSourceInput } from "./sources.schema.js";
import {
  createSource as createSourceRow,
  findAllSources,
  findSourceById,
  setSourceArchived,
  updateSource,
} from "./sources.repository.js";
import { rowToSource, rowToSourceListItem, type Source } from "./sources.types.js";

function defaultPeriod(range: { from?: string; to?: string }) {
  const to = range.to ?? toISODate(today());
  const from = range.from ?? toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));
  return { from, to };
}

export async function listSources(range: { from?: string; to?: string }) {
  const { from, to } = defaultPeriod(range);
  const rows = await findAllSources(pool, { from, to });
  return { items: rows.map(rowToSourceListItem) };
}

export async function getSourceDetail(id: string, range: { from?: string; to?: string }) {
  const row = await findSourceById(pool, id);
  if (!row) throw new NotFoundError("Source not found");

  const { from, to } = defaultPeriod(range);
  const todayStr = toISODate(today());

  const [billRows, revenueRows] = await Promise.all([
    findBillsBySourceId(pool, id, { from, to }),
    findRevenuesBySourceId(pool, id, { from, to }),
  ]);

  const bills = billRows.map((b) => rowToBill(b, todayStr));
  const revenues = revenueRows.map((r) => rowToRevenue(r, todayStr));

  const totalIncomeCents = revenues.reduce((sum, r) => sum + toCents(r.value), 0);
  const totalOutcomeCents = bills.reduce((sum, b) => sum + toCents(b.value), 0);

  return {
    source: rowToSource(row),
    summary: {
      totalIncome: fromCents(totalIncomeCents),
      totalOutcome: fromCents(totalOutcomeCents),
    },
    bills,
    revenues,
  };
}

export async function createSource(input: CreateSourceInput): Promise<Source> {
  const row = await createSourceRow(pool, input);
  return rowToSource({ ...row, has_open_items: false });
}

export async function patchSource(id: string, input: PatchSourceInput): Promise<Source> {
  const existing = await findSourceById(pool, id);
  if (!existing) throw new NotFoundError("Source not found");

  await updateSource(pool, id, input);

  const updated = await findSourceById(pool, id);
  return rowToSource(updated!);
}

export async function setSourceArchiveStatus(id: string, archived: boolean): Promise<Source> {
  const existing = await findSourceById(pool, id);
  if (!existing) throw new NotFoundError("Source not found");

  if (archived && existing.has_open_items) {
    throw new ConflictError(
      "ARCHIVE_BLOCKED",
      "Cannot archive a source with unpaid bills or unreceived revenues",
    );
  }

  await setSourceArchived(pool, id, archived);

  const updated = await findSourceById(pool, id);
  return rowToSource(updated!);
}
