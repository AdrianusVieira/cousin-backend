export interface RevenueRow {
  id: string;
  name: string;
  description: string | null;
  value: string;
  term: string;
  received: boolean;
  source_id: string;
  recurrence_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueWithMeta extends RevenueRow {
  has_linked_transaction: boolean;
}

export interface Revenue {
  id: string;
  name: string;
  description: string | null;
  value: string;
  term: string;
  received: boolean;
  sourceId: string;
  recurrenceId: string | null;
  hasLinkedTransaction: boolean;
  flagged: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToRevenue(row: RevenueWithMeta, todayStr: string): Revenue {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    value: row.value,
    term: row.term,
    received: row.received,
    sourceId: row.source_id,
    recurrenceId: row.recurrence_id,
    hasLinkedTransaction: row.has_linked_transaction,
    flagged:
      (row.received && !row.has_linked_transaction) || (!row.received && row.term < todayStr),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
