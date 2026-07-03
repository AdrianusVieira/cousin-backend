import type { FastifyInstance } from "fastify";
import { importTransactionsSchema } from "./imports.schema.js";
import { importTransactions } from "./imports.service.js";

export async function registerImportRoutes(app: FastifyInstance) {
  app.post("/transactions/import", async (request) => {
    const body = importTransactionsSchema.parse(request.body);
    return importTransactions(body);
  });
}
