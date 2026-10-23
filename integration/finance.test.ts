import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  schema: `cousin_test_${Math.random().toString(36).slice(2)}`,
}));
vi.mock("../src/db/pool.js", async () => {
  const { Pool } = await import("pg");
  return {
    pool: new Pool({
      connectionString: process.env.TEST_DATABASE_URL!,
      options: `-c search_path=${testState.schema},public`,
    }),
  };
});
import { pool } from "../src/db/pool.js";
import { runRecurrenceWindowJob } from "../src/jobs/recurrence-window.js";
import { toISODate, today } from "../src/lib/date.js";
import { getDashboard } from "../src/modules/dashboard/dashboard.service.js";
import { getDashboardDetails } from "../src/modules/dashboard/dashboard.details.js";
import { settleCredit } from "../src/modules/credit/credit.service.js";
import {
  bulkCategorize,
  createTransaction,
  deleteTransactionById,
  listTransactions,
  patchTransaction,
} from "../src/modules/transactions/transactions.service.js";
import { getWalletForecast } from "../src/modules/wallets/forecast.service.js";

const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL! });
let walletId: string;
let categoryId: string;
let sourceId: string;
const date = toISODate(today());
const balance = async () =>
  (
    await pool.query<{ balance: string }>("select balance::text from wallets where id = $1", [
      walletId,
    ])
  ).rows[0]!.balance;
const debit = (amount: string, description = "Lunch") =>
  createTransaction({
    amount,
    categoryId,
    date,
    description,
    fromId: walletId,
    fromType: "wallet",
    method: "debit",
    toType: "external",
  });

beforeAll(async () => {
  await admin.query(`create schema ${testState.schema}`);
  const directory = new URL("../src/db/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    await pool.query(await readFile(new URL(file, directory), "utf8"));
  }
});
afterAll(async () => {
  await pool.end();
  await admin.query(`drop schema if exists ${testState.schema} cascade`);
  await admin.end();
});
beforeEach(async () => {
  await pool.query(
    "truncate transactions, bills, revenues, recurrences, wallets, categories, sources cascade",
  );
  walletId = randomUUID();
  categoryId = randomUUID();
  sourceId = randomUUID();
  await pool.query(
    "insert into wallets (id, name, balance, credit_enabled) values ($1, 'Test wallet', 1000, true)",
    [walletId],
  );
  await pool.query("insert into categories (id, name) values ($1, 'Food')", [categoryId]);
  await pool.query("insert into sources (id, name) values ($1, 'Home')", [sourceId]);
});

describe("financial operations against PostgreSQL", () => {
  it("creates, edits and reverses debit balance changes", async () => {
    const [transaction] = await debit("12.34");
    expect(await balance()).toBe("987.66");
    await patchTransaction(transaction!.id, { amount: "20.00" });
    expect(await balance()).toBe("980.00");
    await deleteTransactionById(transaction!.id);
    expect(await balance()).toBe("1000.00");
  });
  it("preserves simultaneous debit changes on the same wallet", async () => {
    await Promise.all([debit("10.00"), debit("20.00"), debit("30.00")]);
    expect(await balance()).toBe("940.00");
  });
  it("serializes competing edits without drifting the wallet balance", async () => {
    const [transaction] = await debit("12.34");
    await Promise.all([
      patchTransaction(transaction!.id, { amount: "20.00" }),
      patchTransaction(transaction!.id, { amount: "30.00" }),
    ]);
    const { rows } = await pool.query("select amount::text from transactions where id = $1", [
      transaction!.id,
    ]);
    expect(Number(await balance()) + Number(rows[0].amount)).toBe(1000);
  });
  it("reverses a transaction only once when two deletes race", async () => {
    const [transaction] = await debit("12.34");
    const results = await Promise.allSettled([
      deleteTransactionById(transaction!.id),
      deleteTransactionById(transaction!.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toBe("1000.00");
  });
  it("settles a credit exactly once across repeated and simultaneous requests", async () => {
    const [transaction] = await createTransaction({
      amount: "50.00",
      categoryId,
      date,
      description: "Card",
      fromId: walletId,
      method: "credit",
      term: date,
      toType: "external",
    });
    expect(await balance()).toBe("1000.00");
    const input = { transactionIds: [transaction!.id] };
    await Promise.all([settleCredit(input), settleCredit(input)]);
    await settleCredit(input);
    expect(await balance()).toBe("950.00");
    await patchTransaction(transaction!.id, { amount: "60.00" });
    expect(await balance()).toBe("940.00");
    await deleteTransactionById(transaction!.id);
    expect(await balance()).toBe("1000.00");
  });
  it("keeps search, category and wallet summaries aligned with all matching rows", async () => {
    await debit("12.34", "Lunch 100%_special");
    await debit("20.00", "Lunch ordinary");
    const result = await listTransactions({
      from: date,
      to: date,
      search: "%_special",
      category: categoryId,
      wallet: walletId,
      limit: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.summary.totalOut).toBe("12.34");
  });
  it("rolls back bulk assignment when any selected transaction is missing", async () => {
    const [transaction] = await debit("12.34");
    const nextCategory = randomUUID();
    await pool.query("insert into categories (id, name) values ($1, 'Other')", [nextCategory]);
    await expect(
      bulkCategorize({ categoryId: nextCategory, transactionIds: [transaction!.id, randomUUID()] }),
    ).rejects.toThrow();
    const { rows } = await pool.query("select category_id from transactions where id = $1", [
      transaction!.id,
    ]);
    expect(rows[0].category_id).toBe(categoryId);
    expect(
      await bulkCategorize({ categoryId: nextCategory, transactionIds: [transaction!.id] }),
    ).toEqual({ updated: 1 });
  });
  it("matches dashboard totals to their drill-down rows", async () => {
    await debit("12.34");
    await pool.query(
      "insert into bills (name, value, term, source_id) values ('Rent', 100, $1, $2)",
      [date, sourceId],
    );
    const dashboard = await getDashboard({ from: date, to: date });
    const details = await getDashboardDetails({ from: date, to: date, metric: "net" });
    expect(details.income).toBe(dashboard.income.total);
    expect(details.outcome).toBe(dashboard.outcome.total);
    expect(details.net).toBe(dashboard.net);
    expect(details.savingsRate).toBe(dashboard.savingsRate);
  });
  it("does not forecast a bill and its linked card payment twice", async () => {
    const { rows } = await pool.query(
      "insert into bills (name, value, term, source_id) values ('Rent', 100, $1, $2) returning id",
      [date, sourceId],
    );
    await createTransaction({
      amount: "100.00",
      categoryId,
      date,
      description: "Rent card",
      fromId: walletId,
      method: "credit",
      term: date,
      toType: "bill",
      toId: rows[0].id,
    });
    const forecast = await getWalletForecast(30);
    expect(forecast.closingBalance).toBe("900.00");
    expect(forecast.events.map((event) => event.type)).toEqual(["credit"]);
  });
  it("forecasts only the unpaid remainder of a partially linked bill", async () => {
    const { rows } = await pool.query(
      "insert into bills (name, value, term, source_id) values ('Rent', 100, $1, $2) returning id",
      [date, sourceId],
    );
    await createTransaction({
      amount: "40.00",
      categoryId,
      date,
      description: "Partial rent",
      fromType: "wallet",
      fromId: walletId,
      method: "debit",
      toType: "bill",
      toId: rows[0].id,
    });
    const forecast = await getWalletForecast(30);
    expect(forecast.openingBalance).toBe("960.00");
    expect(forecast.events[0]?.amount).toBe("60.00");
    expect(forecast.closingBalance).toBe("900.00");
  });
  it("fills recurrence windows without duplicate instances on repeated or overlapping runs", async () => {
    const { rows } = await pool.query(
      "insert into recurrences (interval_unit, interval_value, recurrent_day) values ('month', 1, 15) returning id",
    );
    const recurrenceId = rows[0].id;
    await pool.query(
      "insert into bills (name, value, term, source_id, recurrence_id) values ('Rent', 100, (current_date - interval '4 months')::date, $1, $2)",
      [sourceId, recurrenceId],
    );
    await Promise.all([runRecurrenceWindowJob(), runRecurrenceWindowJob()]);
    await runRecurrenceWindowJob();
    const { rows: instances } = await pool.query(
      "select term::text from bills where recurrence_id = $1 order by term",
      [recurrenceId],
    );
    expect(new Set(instances.map((row) => row.term)).size).toBe(instances.length);
    expect(instances.filter((row) => row.term >= date)).toHaveLength(3);
  });
});
