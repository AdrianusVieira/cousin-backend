import { randomUUID } from "crypto";
import type { Pool, PoolClient } from "pg";
import { pool } from "../../db/pool.js";
import { toISODate, today } from "../../lib/date.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { fromCents, toCents } from "../../lib/money.js";
import {
  classifyTransaction,
  type TxnFromType,
  type TxnToType,
  walletBalanceDelta,
} from "../../lib/transactions.js";
import { findCategoryById } from "../categories/categories.repository.js";
import { findBillById } from "../bills/bills.repository.js";
import { findRevenueById } from "../revenues/revenues.repository.js";
import { findWalletById } from "../wallets/wallets.repository.js";
import {
  deleteTransaction,
  findAllTransactions,
  findTransactionById,
  findTransactionSummary,
  insertTransaction,
  replaceCategoryAllocations,
  setTransactionCategories,
  updateTransaction,
} from "./transactions.repository.js";
import { validateAllocationTotal, type CategoryAllocationInput } from "./allocations.js";
import type { CreateTransactionInput, PatchTransactionInput } from "./transactions.schema.js";
import { mapFullTransaction, type Transaction } from "./transactions.types.js";

// ---------------------------------------------------------------------------
// Entity validation helpers
// ---------------------------------------------------------------------------

async function validateEndpoint(
  type: string,
  id: string | undefined,
  label: string,
): Promise<void> {
  if (type === "external") return;
  if (!id) throw new ValidationError({ [`${label}Id`]: `Required when ${label}Type is '${type}'` });

  let exists = false;
  if (type === "wallet") {
    exists = !!(await findWalletById(pool, id));
  } else if (type === "revenue") {
    exists = !!(await findRevenueById(pool, id));
  } else if (type === "bill") {
    exists = !!(await findBillById(pool, id));
  }

  if (!exists) throw new ValidationError({ [`${label}Id`]: `Referenced ${type} not found` });
}

// ---------------------------------------------------------------------------
// Cursor encoding
// ---------------------------------------------------------------------------

function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64");
}

function decodeCursor(cursor: string): { date: string; id: string } {
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString()) as { date: string; id: string };
  } catch {
    throw new ValidationError({ cursor: "Invalid cursor" });
  }
}

// ---------------------------------------------------------------------------
// Balance delta application
//
// Debit moves money when it happens. Credit moves none until its statement is
// settled, and then the whole amount leaves the wallet it was drawn from - so a
// settled credit transaction adjusts balances exactly like a debit would.
// ---------------------------------------------------------------------------

interface BalanceAffectingTxn {
  method: "debit" | "credit";
  amount: number;
  fromType: TxnFromType;
  fromId?: string;
  toType: TxnToType;
  toId?: string;
  settled?: boolean;
}

/** Whether `row` has already moved money, and so needs reversing when edited or deleted. */
export function movesMoney(row: {
  method: "debit" | "credit";
  settled_at: string | null;
}): boolean {
  return row.method === "debit" || row.settled_at !== null;
}

export async function applyBalanceDeltas(
  client: Pool | PoolClient,
  txn: BalanceAffectingTxn,
  sign: 1 | -1 = 1,
): Promise<void> {
  if (txn.method === "credit" && !txn.settled) return;

  const fromWallet = txn.fromType === "wallet" && txn.fromId ? txn.fromId : null;
  const toWallet = txn.toType === "wallet" && txn.toId ? txn.toId : null;

  const wallets = new Set([fromWallet, toWallet].filter(Boolean) as string[]);

  for (const walletId of [...wallets].sort()) {
    const delta = walletBalanceDelta(
      {
        method: txn.method,
        amount: txn.amount,
        fromType: txn.fromType,
        fromId: txn.fromId ?? null,
        toType: txn.toType,
        toId: txn.toId ?? null,
        settled: txn.settled,
      },
      walletId,
    );
    if (delta === 0) continue;

    // Atomic increments preserve simultaneous payments; sorted wallet order avoids transfer deadlocks.
    await client.query("update wallets set balance = balance + $2::numeric where id = $1", [
      walletId,
      fromCents(delta * sign),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listTransactions(query: {
  from?: string;
  to?: string;
  method?: "all" | "debit" | "credit";
  category?: string;
  wallet?: string;
  search?: string;
  cursor?: string;
  limit: number;
}) {
  const now = today();
  const from =
    query.from ?? toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = query.to ?? toISODate(now);

  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

  const filter = {
    from,
    to,
    method: query.method,
    categoryId: query.category,
    search: query.search,
    walletId: query.wallet,
    cursor,
    limit: query.limit,
  };

  const [rows, summaryRow] = await Promise.all([
    findAllTransactions(pool, filter),
    findTransactionSummary(pool, {
      from,
      to,
      method: query.method,
      categoryId: query.category,
      walletId: query.wallet,
      search: query.search,
    }),
  ]);

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.date, last.id) : null;

  return {
    summary: {
      totalIn: summaryRow.total_in ?? "0.00",
      totalOut: summaryRow.total_out ?? "0.00",
      net: fromCents(toCents(summaryRow.total_in ?? "0") - toCents(summaryRow.total_out ?? "0")),
    },
    items: items.map(mapFullTransaction),
    nextCursor,
  };
}

export async function getTransaction(id: string): Promise<Transaction> {
  const row = await findTransactionById(pool, id);
  if (!row) throw new NotFoundError("Transaction not found");
  return mapFullTransaction(row);
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction[]> {
  const categoryAllocations =
    input.categoryAllocations ??
    (input.categoryId ? [{ categoryId: input.categoryId, amount: input.amount }] : []);
  if (!categoryAllocations.length)
    throw new ValidationError({ categoryAllocations: "Choose at least one active category" });
  validateAllocationTotal(input.amount, categoryAllocations);
  await validateCategories(categoryAllocations);
  let fromType: TxnFromType;
  let fromId: string | undefined;

  if (input.method === "debit") {
    fromType = input.fromType;
    fromId = input.fromId;
  } else {
    fromType = "wallet";
    fromId = input.fromId;
  }

  const toType: TxnToType = input.toType;
  const toId = input.toId;

  const classification = classifyTransaction({
    fromType,
    fromId: fromId ?? null,
    toType,
    toId: toId ?? null,
  });
  if (!classification) {
    throw new ValidationError({
      fromType: `Invalid from/to combination: ${fromType} → ${toType}`,
    });
  }

  await validateEndpoint(fromType, fromId, "from");
  await validateEndpoint(toType, toId, "to");

  if (input.method === "credit") {
    const now = today();
    const term =
      input.term ?? toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15)));
    const installmentTotal = input.installmentTotal ?? 1;

    const client = await pool.connect();
    try {
      await client.query("begin");

      if (installmentTotal === 1) {
        const id = await insertTransaction(client, {
          amount: input.amount,
          date: input.date,
          description: input.description,
          method: "credit",
          categoryAllocations,
          fromType,
          fromId,
          toType,
          toId,
          settled: false,
          term,
        });
        await client.query("commit");
        const row = await findTransactionById(pool, id);
        return [mapFullTransaction(row!)];
      }

      const creditGroupId = randomUUID();
      const ids: string[] = [];
      let currentTermDate = new Date(`${term}T00:00:00Z`);

      for (let i = 1; i <= installmentTotal; i++) {
        const id = await insertTransaction(client, {
          amount: input.amount,
          date: input.date,
          description: input.description,
          method: "credit",
          categoryAllocations,
          fromType,
          fromId,
          toType,
          toId,
          installmentNumber: i,
          installmentTotal,
          creditGroupId,
          settled: false,
          term: toISODate(currentTermDate),
        });
        ids.push(id);

        currentTermDate.setUTCMonth(currentTermDate.getUTCMonth() + 1);
      }

      await client.query("commit");
      const rows = await Promise.all(ids.map((id) => findTransactionById(pool, id)));
      return rows.filter(Boolean).map((r) => mapFullTransaction(r!));
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const id = await insertTransaction(client, {
      amount: input.amount,
      date: input.date,
      description: input.description,
      method: "debit",
      categoryAllocations,
      fromType,
      fromId,
      toType,
      toId,
      settled: true,
    });

    await applyBalanceDeltas(client, {
      method: "debit",
      amount: toCents(input.amount),
      fromType,
      fromId,
      toType,
      toId,
    });

    await client.query("commit");
    const row = await findTransactionById(pool, id);
    return [mapFullTransaction(row!)];
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function patchTransaction(
  id: string,
  input: PatchTransactionInput,
): Promise<Transaction> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await findTransactionById(client, id, true);
    if (!existing) throw new NotFoundError("Transaction not found");
    const amount = input.amount ?? existing.amount;
    let allocations = input.categoryAllocations;
    if (input.categoryId !== undefined) {
      allocations = input.categoryId ? [{ categoryId: input.categoryId, amount }] : [];
    } else if (allocations === undefined && input.amount !== undefined) {
      allocations =
        existing.category_allocations.length === 1
          ? [{ categoryId: existing.category_allocations[0]!.categoryId, amount }]
          : existing.category_allocations;
    }
    if (allocations !== undefined) {
      validateAllocationTotal(amount, allocations);
      // Historical archived assignments may be retained, but not newly selected.
      await validateCategories(
        allocations,
        existing.category_allocations.map((item) => item.categoryId),
        client,
      );
      await replaceCategoryAllocations(client, id, allocations);
    }
    if (movesMoney(existing) && input.amount !== undefined) {
      const txn = {
        method: existing.method,
        amount: toCents(existing.amount),
        fromType: existing.from_type,
        fromId: existing.from_id ?? undefined,
        toType: existing.to_type,
        toId: existing.to_id ?? undefined,
        settled: true,
      };
      await applyBalanceDeltas(client, { ...txn, amount: toCents(input.amount) - txn.amount });
    }
    await updateTransaction(client, id, input);
    const updated = await findTransactionById(client, id);
    await client.query("commit");
    return mapFullTransaction(updated!);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteTransactionById(id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await findTransactionById(client, id, true);
    if (!existing) throw new NotFoundError("Transaction not found");
    if (movesMoney(existing)) {
      await applyBalanceDeltas(
        client,
        {
          method: existing.method,
          amount: toCents(existing.amount),
          fromType: existing.from_type,
          fromId: existing.from_id ?? undefined,
          toType: existing.to_type,
          toId: existing.to_id ?? undefined,
          settled: true,
        },
        -1,
      );
    }
    await deleteTransaction(client, id);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function validateCategory(
  id: string,
  field = "categoryId",
  retained = false,
  db: Pool | PoolClient = pool,
): Promise<void> {
  const category = await findCategoryById(db, id);
  if (!category || (category.archived && !retained)) {
    throw new ValidationError({ [field]: "Choose an active category" });
  }
}

async function validateCategories(
  allocations: CategoryAllocationInput[],
  retained: string[] = [],
  db: Pool | PoolClient = pool,
): Promise<void> {
  if (new Set(allocations.map((item) => item.categoryId)).size !== allocations.length) {
    throw new ValidationError({ categoryAllocations: "Choose each category only once" });
  }
  for (const item of allocations) {
    await validateCategory(
      item.categoryId,
      "categoryAllocations",
      retained.includes(item.categoryId),
      db,
    );
  }
}

export async function bulkCategorize(input: { categoryId: string; transactionIds: string[] }) {
  await validateCategory(input.categoryId);
  const ids = [...new Set(input.transactionIds)];
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select id from transactions where id = any($1::uuid[]) order by id for update",
      [ids],
    );
    if (rows.length !== ids.length)
      throw new NotFoundError("One or more transactions no longer exist");
    await setTransactionCategories(client, ids, input.categoryId);
    await client.query("commit");
    return { updated: ids.length };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
