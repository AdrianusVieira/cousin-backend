import { pool } from "../../db/pool.js";
import { addDays, dateRange, toISODate, today } from "../../lib/date.js";
import { fromCents, toCents } from "../../lib/money.js";
import {
  findForecastEvents,
  findForecastOpeningBalance,
  type ForecastEvent,
} from "./forecast.repository.js";

export function buildForecast(
  opening: string,
  events: ForecastEvent[],
  from: string,
  days: number,
) {
  const to = toISODate(addDays(new Date(`${from}T00:00:00Z`), days));
  let balance = toCents(opening);
  const scheduled = events
    .filter((event) => event.date <= to)
    .map((event) => ({
      ...event,
      overdue: event.date < from,
      scheduledDate: event.date < from ? from : event.date,
    }));
  const series = dateRange(from, to).map((date) => {
    const items = scheduled.filter((event) => event.scheduledDate === date);
    const income = items
      .filter((event) => event.type === "revenue")
      .reduce((sum, event) => sum + toCents(event.amount), 0);
    const outcome = items
      .filter((event) => event.type !== "revenue")
      .reduce((sum, event) => sum + toCents(event.amount), 0);
    balance += income - outcome;
    return {
      date,
      balance: fromCents(balance),
      income: fromCents(income),
      outcome: fromCents(outcome),
    };
  });
  const lowest = series.reduce(
    (min, point) => (toCents(point.balance) < toCents(min.balance) ? point : min),
    series[0]!,
  );
  return {
    asOf: from,
    days,
    openingBalance: opening,
    closingBalance: fromCents(balance),
    lowestBalance: lowest.balance,
    lowestDate: lowest.date,
    firstNegativeDate: series.find((point) => toCents(point.balance) < 0)?.date ?? null,
    series,
    events: scheduled,
  };
}

export async function getWalletForecast(days: number) {
  const from = toISODate(today());
  const to = toISODate(addDays(today(), days));
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const opening = await findForecastOpeningBalance(client);
    const events = await findForecastEvents(client, to);
    await client.query("commit");
    return buildForecast(opening, events, from, days);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
