import { pool } from "../db/pool.js";
import { computeNextTerm, lookaheadCount } from "../lib/recurrences.js";
import { createBill } from "../modules/bills/bills.repository.js";
import {
  deleteRecurrence,
  findRecurrencesForWindowJob,
  type WindowJobRow,
} from "../modules/recurrences/recurrences.repository.js";
import { createRevenue } from "../modules/revenues/revenues.repository.js";

export async function runRecurrenceWindowJob(): Promise<void> {
  const tasks = await findRecurrencesForWindowJob(pool);
  const errors: Array<{ id: string; error: unknown }> = [];

  for (const task of tasks) {
    try {
      await processRecurrence(task);
    } catch (error) {
      errors.push({ id: task.id, error });
    }
  }

  if (errors.length > 0) {
    for (const { id, error } of errors) {
      console.error(`recurrence-window: failed to process recurrence ${id}`, error);
    }
    throw new Error(
      `recurrence-window: ${errors.length} of ${tasks.length} recurrences failed`,
    );
  }
}

async function processRecurrence(task: WindowJobRow): Promise<void> {
  const totalCount = Number(task.total_count);
  const futureCount = Number(task.future_count);

  if (totalCount === 0) {
    await deleteRecurrence(pool, task.id);
    return;
  }

  const needed = lookaheadCount(task.interval_unit) - futureCount;
  if (needed <= 0) return;

  const client = await pool.connect();
  try {
    await client.query("begin");

    const config = {
      intervalUnit: task.interval_unit,
      intervalValue: task.interval_value,
      recurrentDay: task.recurrent_day,
      recurrentMonth: task.recurrent_month,
    };
    const common = {
      name: task.template_name ?? "",
      value: task.is_variable
        ? task.estimated_value ?? task.template_value ?? "0.00"
        : task.template_value ?? "0.00",
      sourceId: task.template_source_id ?? "",
      description: task.template_description ?? undefined,
      recurrenceId: task.id,
    };

    let lastTerm = task.max_term!;
    for (let i = 0; i < needed; i++) {
      lastTerm = computeNextTerm(lastTerm, config);
      if (task.type === "bill") {
        await createBill(client, { ...common, term: lastTerm });
      } else {
        await createRevenue(client, { ...common, term: lastTerm });
      }
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
