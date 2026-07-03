import { fromCents, toCents } from "./money.js";

export type IntervalUnit = "day" | "week" | "month" | "year";

export interface RecurrenceConfig {
  intervalUnit: IntervalUnit;
  intervalValue: number;
  recurrentDay: number;
  recurrentMonth?: number | null;
}

export interface RecurrenceInstance {
  id: string;
  isPaid: boolean;
  term: string;
  value: string;
}

export interface RecurrenceValueUpdate {
  estimatedValue: string;
  propagateIds: string[];
}

/**
 * Given all sibling instances of a variable recurrence, including the
 * already-updated edited row, computes the new estimated value (average of
 * value across instances strictly before edited.term — past instances only)
 * and which future, unpaid siblings should be set to it. When the edited row
 * is the earliest instance there is no past to average, so its own value is
 * used as the estimate.
 */
export function computeRecurrenceValueUpdate(
  instances: RecurrenceInstance[],
  editedId: string,
): RecurrenceValueUpdate {
  const edited = instances.find((i) => i.id === editedId)!;

  const pastCents = instances
    .filter((i) => i.term < edited.term)
    .map((i) => toCents(i.value));

  const totalCents = pastCents.reduce((sum, c) => sum + c, 0);
  const estimatedValue = pastCents.length
    ? fromCents(totalCents / pastCents.length)
    : edited.value;

  const propagateIds = instances
    .filter((i) => i.term > edited.term && !i.isPaid)
    .map((i) => i.id);

  return { estimatedValue, propagateIds };
}

export interface RecurrenceEstimateResult {
  estimatedValue: string | null;
  propagateIds: string[];
}

/**
 * Recomputes a variable recurrence's estimate from scratch: averages the value
 * of instances strictly before today and returns the *strictly future* unpaid
 * siblings that should adopt it. The current (nearest upcoming) instance is
 * never rewritten — it's the one about to be paid, so its value is vital and
 * preserved. Yields a null estimate (and no propagation) when there are no past
 * instances to average.
 */
export function computeEstimateFromPast(
  instances: RecurrenceInstance[],
  todayISO: string,
): RecurrenceEstimateResult {
  const pastCents = instances
    .filter((i) => i.term < todayISO)
    .map((i) => toCents(i.value));

  if (pastCents.length === 0) return { estimatedValue: null, propagateIds: [] };

  const totalCents = pastCents.reduce((sum, c) => sum + c, 0);
  const estimatedValue = fromCents(totalCents / pastCents.length);

  const currentTerm = instances
    .filter((i) => i.term >= todayISO)
    .map((i) => i.term)
    .sort()[0];

  const propagateIds = instances
    .filter((i) => currentTerm !== undefined && i.term > currentTerm && !i.isPaid)
    .map((i) => i.id);

  return { estimatedValue, propagateIds };
}

/** Number of instances to materialize ahead of the current one. */
export function lookaheadCount(intervalUnit: IntervalUnit): number {
  return intervalUnit === "year" ? 1 : 3;
}

/** Computes the next occurrence date given the current term and recurrence config. */
export function computeNextTerm(currentTerm: string, config: RecurrenceConfig): string {
  const { intervalUnit, intervalValue, recurrentDay, recurrentMonth } = config;

  switch (intervalUnit) {
    case "day": {
      const d = new Date(`${currentTerm}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + intervalValue);
      return d.toISOString().slice(0, 10);
    }
    case "week": {
      const d = new Date(`${currentTerm}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + intervalValue * 7);
      return d.toISOString().slice(0, 10);
    }
    case "month": {
      const d = new Date(`${currentTerm}T00:00:00Z`);
      let year = d.getUTCFullYear();
      let month = d.getUTCMonth() + intervalValue;
      year += Math.floor(month / 12);
      month = month % 12;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const day = Math.min(recurrentDay, lastDay);
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    case "year": {
      const d = new Date(`${currentTerm}T00:00:00Z`);
      const year = d.getUTCFullYear() + intervalValue;
      const month = (recurrentMonth ?? 1) - 1;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const day = Math.min(recurrentDay, lastDay);
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
}
