import type { FastifyInstance } from "fastify";
import { creditListQuerySchema, settleSchema } from "./credit.schema.js";
import { listCredit, settleCredit } from "./credit.service.js";

export async function registerCreditRoutes(app: FastifyInstance) {
  app.get("/credit", async (request) => {
    const query = creditListQuerySchema.parse(request.query);
    return listCredit(query);
  });

  app.post("/credit/settle", async (request) => {
    const body = settleSchema.parse(request.body);
    return settleCredit(body);
  });
}
