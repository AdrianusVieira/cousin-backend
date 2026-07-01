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
 * value across instances with term <= edited.term) and which future, unpaid
 * siblings should be set to it.
 */
export function computeRecurrenceValueUpdate(
  instances: RecurrenceInstance[],
  editedId: string,
): RecurrenceValueUpdate {
  const edited = instances.find((i) => i.id === editedId)!;

  const upToEditedCents = instances
    .filter((i) => i.term <= edited.term)
    .map((i) => toCents(i.value));

  const totalCents = upToEditedCents.reduce((sum, c) => sum + c, 0);
  const estimatedValue = fromCents(totalCents / upToEditedCents.length);

  const propagateIds = instances
    .filter((i) => i.term > edited.term && !i.isPaid)
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
