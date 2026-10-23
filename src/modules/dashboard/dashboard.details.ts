import { pool } from "../../db/pool.js";
import { fromCents, toCents } from "../../lib/money.js";
import { findDashboardContributions } from "./dashboard.repository.js";

export async function getDashboardDetails(query: {
  from: string;
  to: string;
  metric: "income" | "outcome" | "net" | "savingsRate";
}) {
  const contributions = await findDashboardContributions(pool, query);
  const income = contributions
    .filter((row) => row.direction === "income")
    .reduce((sum, row) => sum + toCents(row.amount), 0);
  const outcome = contributions
    .filter((row) => row.direction === "outcome")
    .reduce((sum, row) => sum + toCents(row.amount), 0);
  return {
    income: fromCents(income),
    outcome: fromCents(outcome),
    net: fromCents(income - outcome),
    savingsRate: income === 0 ? 0 : Math.round(((income - outcome) / income) * 10000) / 100,
    items:
      query.metric === "income" || query.metric === "outcome"
        ? contributions.filter((row) => row.direction === query.metric)
        : contributions,
  };
}
