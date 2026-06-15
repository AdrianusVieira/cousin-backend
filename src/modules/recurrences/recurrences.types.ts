import type { IntervalUnit } from "../../lib/recurrences.js";

export interface RecurrenceRow {
  id: string;
  is_variable: boolean;
  interval_unit: IntervalUnit;
  interval_value: number;
  recurrent_day: number;
  recurrent_month: number | null;
  estimated_value: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recurrence {
  id: string;
  isVariable: boolean;
  intervalUnit: IntervalUnit;
  intervalValue: number;
  recurrentDay: number;
  recurrentMonth: number | null;
  estimatedValue: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToRecurrence(row: RecurrenceRow, active: boolean): Recurrence {
  return {
    id: row.id,
    isVariable: row.is_variable,
    intervalUnit: row.interval_unit,
    intervalValue: row.interval_value,
    recurrentDay: row.recurrent_day,
    recurrentMonth: row.recurrent_month,
    estimatedValue: row.estimated_value,
    active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
