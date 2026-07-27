export interface Wallet {
  id: string;
  name: string;
  description: string | null;
  balance: string;
  archived: boolean;
  creditEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WalletRow {
  id: string;
  name: string;
  description: string | null;
  balance: string;
  archived: boolean;
  credit_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToWallet(row: WalletRow): Wallet {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    balance: row.balance,
    archived: row.archived,
    creditEnabled: row.credit_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
