import { randomUUID } from "crypto";
import type { Pool, PoolClient } from "pg";
import { pool } from "../../db/pool.js";
import { toISODate, today } from "../../lib/date.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { fromCents, toCents } from "../../lib/money.js";
import { classifyTransaction, type TxnFromType, type TxnToType, walletBalanceDelta } from "../../lib/transactions.js";
import { findBillById } from "../bills/bills.repository.js";
import { findRevenueById } from "../revenues/revenues.repository.js";
import { findWalletById, updateWallet } from "../wallets/wallets.repository.js";
import {
  deleteTransaction,
  findAllTransactions,
  findTransactionById,
  findTransactionSummary,
  insertTransaction,
  updateTransaction,
} from "./transactions.repository.js";
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
// Balance delta application (debit only; credit never touches balances)
// ---------------------------------------------------------------------------

async function applyBalanceDeltas(
  client: Pool | PoolClient,
  txn: {
    method: "debit" | "credit";
    amount: number;
    fromType: TxnFromType;
    fromId?: string;
    toType: TxnToType;
    toId?: string;
  },
  sign: 1 | -1 = 1,
): Promise<void> {
  if (txn.method !== "debit") return;

  const fromWallet = txn.fromType === "wallet" && txn.fromId ? txn.fromId : null;
  const toWallet = txn.toType === "wallet" && txn.toId ? txn.toId : null;

  const wallets = new Set([fromWallet, toWallet].filter(Boolean) as string[]);

  for (const walletId of wallets) {
    const delta = walletBalanceDelta(
      {
        method: "debit",
        amount: txn.amount,
        fromType: txn.fromType,
        fromId: txn.fromId ?? null,
        toType: txn.toType,
        toId: txn.toId ?? null,
      },
      walletId,
    );
    if (delta === 0) continue;

    const row = await findWalletById(client, walletId);
    if (!row) continue;
    const newBalance = fromCents(toCents(row.balance) + delta * sign);
    await updateWallet(client, walletId, { balance: newBalance });
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
  cursor?: string;
  limit: number;
}) {
  const now = today();
  const from = query.from ?? toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = query.to ?? toISODate(now);

  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

  const filter = {
    from,
    to,
    method: query.method,
    categoryId: query.category,
    walletId: query.wallet,
    cursor,
    limit: query.limit,
  };

  const [rows, summaryRow] = await Promise.all([
    findAllTransactions(pool, filter),
    findTransactionSummary(pool, { from, to, method: query.method, categoryId: query.category, walletId: query.wallet }),
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
      input.term ??
      toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15)));
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
          categoryId: input.categoryId,
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
      let currentDate = new Date(`${input.date}T00:00:00Z`);
      let currentTermDate = new Date(`${term}T00:00:00Z`);

      for (let i = 1; i <= installmentTotal; i++) {
        const id = await insertTransaction(client, {
          amount: input.amount,
          date: toISODate(currentDate),
          description: input.description,
          method: "credit",
          categoryId: input.categoryId,
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

        currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
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
      categoryId: input.categoryId,
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
  const existing = await findTransactionById(pool, id);
  if (!existing) throw new NotFoundError("Transaction not found");

  const updateFields = {
    amount: input.amount,
    date: input.date,
    description: "description" in input ? (input.description ?? undefined) : undefined,
    categoryId: "categoryId" in input ? (input.categoryId ?? null) : undefined,
  };

  if (existing.method === "debit" && input.amount !== undefined) {
    const client = await pool.connect();
    try {
      await client.query("begin");

      await applyBalanceDeltas(
        client,
        {
          method: "debit",
          amount: toCents(existing.amount),
          fromType: existing.from_type,
          fromId: existing.from_id ?? undefined,
          toType: existing.to_type,
          toId: existing.to_id ?? undefined,
        },
        -1,
      );

      await applyBalanceDeltas(client, {
        method: "debit",
        amount: toCents(input.amount),
        fromType: existing.from_type,
        fromId: existing.from_id ?? undefined,
        toType: existing.to_type,
        toId: existing.to_id ?? undefined,
      });

      await updateTransaction(client, id, updateFields);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  } else {
    await updateTransaction(pool, id, updateFields);
  }

  const updated = await findTransactionById(pool, id);
  return mapFullTransaction(updated!);
}

export async function deleteTransactionById(id: string): Promise<void> {
  const existing = await findTransactionById(pool, id);
  if (!existing) throw new NotFoundError("Transaction not found");

  if (existing.method === "debit") {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await applyBalanceDeltas(
        client,
        {
          method: "debit",
          amount: toCents(existing.amount),
          fromType: existing.from_type,
          fromId: existing.from_id ?? undefined,
          toType: existing.to_type,
          toId: existing.to_id ?? undefined,
        },
        -1,
      );
      await deleteTransaction(client, id);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  } else {
    await deleteTransaction(pool, id);
  }
}
