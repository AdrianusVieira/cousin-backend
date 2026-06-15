import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => app.log.info(`cousin-backend listening at ${address}`))
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
