export interface SourceRow {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourceListRow extends SourceRow {
  has_open_items: boolean;
  income: string | null;
  outcome: string | null;
}

export interface SourceDetailRow extends SourceRow {
  has_open_items: boolean;
}

export interface Source {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  hasOpenItems: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToSource(row: SourceDetailRow): Source {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archived: row.archived,
    hasOpenItems: row.has_open_items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToSourceListItem(
  row: SourceListRow,
): Source & { income: string; outcome: string } {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archived: row.archived,
    hasOpenItems: row.has_open_items,
    income: row.income ?? "0.00",
    outcome: row.outcome ?? "0.00",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
