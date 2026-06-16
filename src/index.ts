import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { runRecurrenceWindowJob } from "./jobs/recurrence-window.js";

const app = buildApp();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let jobTimer: NodeJS.Timeout | undefined;

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`cousin-backend listening at ${address}`);
    runRecurrenceWindowJob().catch((err) =>
      app.log.error({ err }, "recurrence-window job failed on startup"),
    );
    jobTimer = setInterval(() => {
      runRecurrenceWindowJob().catch((err) =>
        app.log.error({ err }, "recurrence-window job failed"),
      );
    }, ONE_DAY_MS);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });

async function shutdown(signal: string) {
  app.log.info(`received ${signal}, shutting down`);

  if (jobTimer) clearInterval(jobTimer);

  try {
    await app.close();
    await pool.end();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "error during shutdown");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
