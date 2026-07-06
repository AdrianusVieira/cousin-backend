import { randomUUID } from "crypto";
import { pool } from "../../db/pool.js";
import { NotFoundError } from "../../lib/errors.js";
import { toCents } from "../../lib/money.js";
import { findWalletById } from "../wallets/wallets.repository.js";
import { findTransactionsByIds, insertTransaction } from "../transactions/transactions.repository.js";
import { mapFullTransaction } from "../transactions/transactions.types.js";
import { findExistingCreditGroupId, findExistingCreditTxnKeys } from "./imports.repository.js";
import type { ImportRowInput, ImportTransactionsInput } from "./imports.schema.js";
import type { ImportTransactionsResult, SkippedImportRow } from "./imports.types.js";

function normalizeDescription(description?: string): string {
  return (description ?? "").trim().replace(/\s+/g, " ");
}

function dedupKey(date: string, description: string, amount: string): string {
  return `${date}|${description}|${amount}`;
}

export async function importTransactions(input: ImportTransactionsInput): Promise<ImportTransactionsResult> {
  const wallet = await findWalletById(pool, input.walletId);
  if (!wallet) throw new NotFoundError("Wallet not found");

  const dates = input.rows.map((r) => r.date);
  const fromDate = dates.reduce((a, b) => (a < b ? a : b));
  const toDate = dates.reduce((a, b) => (a > b ? a : b));

  const client = await pool.connect();
  try {
    await client.query("begin");

    const existingKeys = await findExistingCreditTxnKeys(client, input.walletId, fromDate, toDate);
    const seenKeys = new Set(
      existingKeys.map((k) => dedupKey(k.date, normalizeDescription(k.description ?? undefined), k.amount)),
    );

    const groupCache = new Map<string, string>(); // `${description}::${installmentTotal}` -> credit_group_id
    const importedIds: string[] = [];
    const skipped: SkippedImportRow[] = [];

    for (let i = 0; i < input.rows.length; i++) {
      const row: ImportRowInput = input.rows[i]!;
      const description = normalizeDescription(row.description);

      if (toCents(row.amount) < 0) {
        skipped.push({ amount: row.amount, date: row.date, description: description || null, index: i, reason: "negativeAmount" });
        continue;
      }

      const key = dedupKey(row.date, description, row.amount);
      if (seenKeys.has(key)) {
        skipped.push({ amount: row.amount, date: row.date, description: description || null, index: i, reason: "duplicate" });
        continue;
      }
      seenKeys.add(key); // also catches duplicates within this same batch

      const hasInstallments = row.installmentTotal !== undefined && row.installmentTotal > 1;
      let creditGroupId: string | undefined;

      if (hasInstallments) {
        const groupKey = `${description}::${row.installmentTotal}`;
        creditGroupId = groupCache.get(groupKey);
        if (!creditGroupId) {
          creditGroupId =
            (await findExistingCreditGroupId(client, input.walletId, description, row.installmentTotal!)) ??
            randomUUID();
        }
        groupCache.set(groupKey, creditGroupId);
      }

      const id = await insertTransaction(client, {
        amount: row.amount,
        creditGroupId,
        date: row.date,
        description: description || undefined,
        fromId: input.walletId,
        fromType: "wallet",
        installmentNumber: hasInstallments ? row.installmentNumber : undefined,
        installmentTotal: hasInstallments ? row.installmentTotal : undefined,
        method: "credit",
        settled: false,
        term: input.term,
        toType: "external",
      });
      importedIds.push(id);
    }

    await client.query("commit");

    const importedRows = await findTransactionsByIds(pool, importedIds);
    return {
      imported: importedRows.map(mapFullTransaction),
      skipped,
      summary: {
        importedCount: importedIds.length,
        skippedCount: skipped.length,
        totalRows: input.rows.length,
      },
    };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
