export type IntervalUnit = "day" | "week" | "month" | "year";

export interface RecurrenceConfig {
  intervalUnit: IntervalUnit;
  intervalValue: number;
  recurrentDay: number;
  recurrentMonth?: number | null;
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
