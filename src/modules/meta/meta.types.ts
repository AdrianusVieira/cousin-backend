export const META_ENTITY = {
  Bills: "bills",
  Categories: "categories",
  Recurrences: "recurrences",
  Revenues: "revenues",
  Sources: "sources",
  Transactions: "transactions",
  Wallets: "wallets",
} as const;

export type MetaEntity = (typeof META_ENTITY)[keyof typeof META_ENTITY];

export type LastUpdatedRow = Record<MetaEntity, Date | null>;

export type LastUpdated = Record<MetaEntity, string | null>;

export function rowToLastUpdated(row: LastUpdatedRow): LastUpdated {
  const entries = Object.values(META_ENTITY).map((entity) => [
    entity,
    row[entity]?.toISOString() ?? null,
  ]);
  return Object.fromEntries(entries) as LastUpdated;
}
