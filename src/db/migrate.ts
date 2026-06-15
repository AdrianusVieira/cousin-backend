import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { env } from "../config/env.js";

const migrationsDir = path.dirname(fileURLToPath(import.meta.url)) + "/migrations";

async function migrate() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  await pool.query(`
    create table if not exists _migrations (
      name        varchar primary key,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows: applied } = await pool.query<{ name: string }>("select name from _migrations");
  const appliedNames = new Set(applied.map((row) => row.name));

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (appliedNames.has(file)) continue;

    const sql = await readFile(path.join(migrationsDir, file), "utf-8");
    console.log(`Applying ${file}...`);

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into _migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log("Migrations up to date.");
  await pool.end();
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
