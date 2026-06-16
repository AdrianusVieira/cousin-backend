import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { ApiError } from "./lib/errors.js";
import { requireAuth } from "./middleware/auth.js";
import { registerBillRoutes } from "./modules/bills/bills.routes.js";
import { registerCategoryRoutes } from "./modules/categories/categories.routes.js";
import { registerCreditRoutes } from "./modules/credit/credit.routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { registerRecurrenceRoutes } from "./modules/recurrences/recurrences.routes.js";
import { registerRevenueRoutes } from "./modules/revenues/revenues.routes.js";
import { registerSourceRoutes } from "./modules/sources/sources.routes.js";
import { registerTransactionRoutes } from "./modules/transactions/transactions.routes.js";
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
      await registerBillRoutes(api);
      await registerCategoryRoutes(api);
      await registerCreditRoutes(api);
      await registerDashboardRoutes(api);
      await registerRecurrenceRoutes(api);
      await registerRevenueRoutes(api);
      await registerSourceRoutes(api);
      await registerTransactionRoutes(api);
      await registerWalletRoutes(api);
    },
    { prefix: "/api" },
  );

  return app;
}
