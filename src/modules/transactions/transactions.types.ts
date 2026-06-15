import { classifyTransaction, type TxnFromType, type TxnKind, type TxnSign, type TxnToType } from "../../lib/transactions.js";

export interface FullTransactionRow {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  method: "debit" | "credit";
  category_id: string | null;
  category_name: string | null;
  from_type: TxnFromType;
  from_id: string | null;
  from_name: string | null;
  to_type: TxnToType;
  to_id: string | null;
  to_name: string | null;
  installment_number: number | null;
  installment_total: number | null;
  credit_group_id: string | null;
  settled: boolean;
  term: string | null;
  created_at: string;
  updated_at: string;
}

export interface TxnEndpointShape {
  type: TxnFromType | TxnToType;
  id: string | null;
  name: string | null;
}

export interface Transaction {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  method: "debit" | "credit";
  category: { id: string; name: string } | null;
  from: TxnEndpointShape;
  to: TxnEndpointShape;
  installmentNumber: number | null;
  installmentTotal: number | null;
  creditGroupId: string | null;
  settled: boolean;
  term: string | null;
  kind: TxnKind;
  sign: TxnSign;
  createdAt: string;
  updatedAt: string;
}

export function mapFullTransaction(row: FullTransactionRow): Transaction {
  const classification = classifyTransaction({
    fromType: row.from_type,
    fromId: row.from_id,
    toType: row.to_type,
    toId: row.to_id,
  });

  return {
    id: row.id,
    amount: row.amount,
    date: row.date,
    description: row.description,
    method: row.method,
    category:
      row.category_id && row.category_name
        ? { id: row.category_id, name: row.category_name }
        : null,
    from: { type: row.from_type, id: row.from_id, name: row.from_name },
    to: { type: row.to_type, id: row.to_id, name: row.to_name },
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    creditGroupId: row.credit_group_id,
    settled: row.settled,
    term: row.term,
    kind: classification?.kind ?? "manualAdjustment",
    sign: classification?.sign ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
