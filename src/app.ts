import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { ApiError } from "./lib/errors.js";
import { requireAuth } from "./middleware/auth.js";
import { registerWalletRoutes } from "./modules/wallets/wallets.routes.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.status).send(error.toBody());
      return;
    }

    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        fields[issue.path.join(".") || "_"] = issue.message;
      }
      reply.status(422).send({
        error: { code: "VALIDATION_ERROR", message: "Validation failed", fields },
      });
      return;
    }

    app.log.error(error);
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  app.register(
    async (api) => {
      api.addHook("onRequest", requireAuth);
      await registerWalletRoutes(api);
    },
    { prefix: "/api" },
  );

  return app;
}
