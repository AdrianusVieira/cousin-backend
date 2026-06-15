export interface BillRow {
  id: string;
  name: string;
  description: string | null;
  value: string;
  term: string;
  paid: boolean;
  source_id: string;
  recurrence_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillWithMeta extends BillRow {
  has_linked_transaction: boolean;
}

export interface Bill {
  id: string;
  name: string;
  description: string | null;
  value: string;
  term: string;
  paid: boolean;
  sourceId: string;
  recurrenceId: string | null;
  hasLinkedTransaction: boolean;
  flagged: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToBill(row: BillWithMeta, todayStr: string): Bill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    value: row.value,
    term: row.term,
    paid: row.paid,
    sourceId: row.source_id,
    recurrenceId: row.recurrence_id,
    hasLinkedTransaction: row.has_linked_transaction,
    flagged: (row.paid && !row.has_linked_transaction) || (!row.paid && row.term < todayStr),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
