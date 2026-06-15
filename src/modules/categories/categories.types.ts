export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryListRow extends CategoryRow {
  income: string | null;
  outcome: string | null;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToCategoryListItem(
  row: CategoryListRow,
): Category & { income: string; outcome: string } {
  return {
    ...rowToCategory(row),
    income: row.income ?? "0.00",
    outcome: row.outcome ?? "0.00",
  };
}
