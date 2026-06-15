import { pool } from "../../db/pool.js";
import { subtractMonths, toISODate, today } from "../../lib/date.js";
import { NotFoundError } from "../../lib/errors.js";
import { fromCents, toCents } from "../../lib/money.js";
import type { CreateCategoryInput, PatchCategoryInput } from "./categories.schema.js";
import {
  createCategory as createCategoryRow,
  findAllCategories,
  findCategoryBreakdown,
  findCategoryById,
  setCategoryArchived,
  updateCategory,
} from "./categories.repository.js";
import { rowToCategory, rowToCategoryListItem, type Category } from "./categories.types.js";

function defaultPeriod(range: { from?: string; to?: string }) {
  const to = range.to ?? toISODate(today());
  const from = range.from ?? toISODate(subtractMonths(new Date(`${to}T00:00:00Z`), 3));
  return { from, to };
}

function bucketGranularity(from: string, to: string): "week" | "month" {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();
  const days = Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24));
  return days <= 31 ? "week" : "month";
}

export async function listCategories(filter: { from?: string; to?: string; active?: boolean }) {
  const { from, to } = defaultPeriod(filter);
  const rows = await findAllCategories(pool, { from, to, active: filter.active });
  return { items: rows.map(rowToCategoryListItem) };
}

export async function getCategoryDetail(id: string, range: { from?: string; to?: string }) {
  const row = await findCategoryById(pool, id);
  if (!row) throw new NotFoundError("Category not found");

  const { from, to } = defaultPeriod(range);
  const granularity = bucketGranularity(from, to);

  const breakdownRows = await findCategoryBreakdown(pool, id, { from, to, granularity });

  const breakdown = breakdownRows.map((r) => ({
    bucket: r.bucket.slice(0, 10),
    income: r.income ?? "0.00",
    outcome: r.outcome ?? "0.00",
  }));

  const totalIncomeCents = breakdown.reduce((sum, r) => sum + toCents(r.income), 0);
  const totalOutcomeCents = breakdown.reduce((sum, r) => sum + toCents(r.outcome), 0);

  return {
    category: rowToCategory(row),
    summary: {
      totalIncome: fromCents(totalIncomeCents),
      totalOutcome: fromCents(totalOutcomeCents),
    },
    breakdown,
  };
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const row = await createCategoryRow(pool, input);
  return rowToCategory(row);
}

export async function patchCategory(id: string, input: PatchCategoryInput): Promise<Category> {
  const existing = await findCategoryById(pool, id);
  if (!existing) throw new NotFoundError("Category not found");

  const row = await updateCategory(pool, id, input);
  return rowToCategory(row!);
}

export async function setCategoryArchiveStatus(
  id: string,
  archived: boolean,
): Promise<Category> {
  const existing = await findCategoryById(pool, id);
  if (!existing) throw new NotFoundError("Category not found");

  const row = await setCategoryArchived(pool, id, archived);
  return rowToCategory(row!);
}
