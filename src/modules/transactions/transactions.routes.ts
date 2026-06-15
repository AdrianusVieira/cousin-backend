import type { FastifyInstance } from "fastify";
import {
  createTransactionSchema,
  patchTransactionSchema,
  transactionListQuerySchema,
} from "./transactions.schema.js";
import {
  createTransaction,
  deleteTransactionById,
  getTransaction,
  listTransactions,
  patchTransaction,
} from "./transactions.service.js";

export async function registerTransactionRoutes(app: FastifyInstance) {
  app.get("/transactions", async (request) => {
    const query = transactionListQuerySchema.parse(request.query);
    return listTransactions(query);
  });

  app.post("/transactions", async (request, reply) => {
    const body = createTransactionSchema.parse(request.body);
    const transactions = await createTransaction(body);
    reply.status(201);
    return transactions;
  });

  app.get<{ Params: { id: string } }>("/transactions/:id", async (request) => {
    return getTransaction(request.params.id);
  });

  app.patch<{ Params: { id: string } }>("/transactions/:id", async (request) => {
    const body = patchTransactionSchema.parse(request.body);
    return patchTransaction(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/transactions/:id", async (request, reply) => {
    await deleteTransactionById(request.params.id);
    reply.status(204);
  });
}
