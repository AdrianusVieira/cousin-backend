import type { Transaction } from "../transactions/transactions.types.js";

export type SkippedImportReason = "duplicate" | "negativeAmount";

export interface SkippedImportRow {
  amount: string;
  date: string;
  description: string | null;
  index: number; // position in the request's rows[] array
  reason: SkippedImportReason;
}

export interface ImportTransactionsResult {
  imported: Transaction[];
  skipped: SkippedImportRow[];
  summary: {
    importedCount: number;
    skippedCount: number;
    totalRows: number;
  };
}
