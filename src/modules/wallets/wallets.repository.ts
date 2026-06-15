import type { Pool, PoolClient } from "pg";
import type { CreateWalletInput } from "./wallets.schema.js";
import { type WalletRow } from "./wallets.types.js";

export async function findAllWallets(
  db: Pool | PoolClient,
  { active }: { active?: boolean } = {},
): Promise<WalletRow[]> {
  const conditions: string[] = [];
  if (active === true) conditions.push("archived = false");
  if (active === false) conditions.push("archived = true");

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await db.query<WalletRow>(
    `select * from wallets ${where} order by created_at asc`,
  );
  return rows;
}

export async function findWalletById(
  db: Pool | PoolClient,
  id: string,
): Promise<WalletRow | null> {
  const { rows } = await db.query<WalletRow>("select * from wallets where id = $1", [id]);
  return rows[0] ?? null;
}

export async function createWallet(
  db: Pool | PoolClient,
  input: CreateWalletInput,
): Promise<WalletRow> {
  const { rows } = await db.query<WalletRow>(
    `insert into wallets (name, description) values ($1, $2) returning *`,
    [input.name, input.description ?? null],
  );
  return rows[0]!;
}

export async function updateWallet(
  db: Pool | PoolClient,
  id: string,
  fields: { name?: string; description?: string; balance?: string },
): Promise<WalletRow> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    values.push(fields.name);
    sets.push(`name = $${values.length}`);
  }
  if (fields.description !== undefined) {
    values.push(fields.description);
    sets.push(`description = $${values.length}`);
  }
  if (fields.balance !== undefined) {
    values.push(fields.balance);
    sets.push(`balance = $${values.length}`);
  }

  values.push(id);
  const { rows } = await db.query<WalletRow>(
    `update wallets set ${sets.join(", ")} where id = $${values.length} returning *`,
    values,
  );
  return rows[0]!;
}

export async function setWalletArchived(
  db: Pool | PoolClient,
  id: string,
  archived: boolean,
): Promise<WalletRow> {
  const { rows } = await db.query<WalletRow>(
    `update wallets set archived = $1 where id = $2 returning *`,
    [archived, id],
  );
  return rows[0]!;
}
