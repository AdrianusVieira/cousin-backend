import type { FastifyInstance } from "fastify";
import {
  billDetailQuerySchema,
  billListQuerySchema,
  createBillSchema,
  patchBillSchema,
} from "./bills.schema.js";
import {
  createBill,
  deleteBill,
  getBillDetail,
  listBills,
  patchBill,
} from "./bills.service.js";

export async function registerBillRoutes(app: FastifyInstance) {
  app.get("/bills", async (request) => {
    const query = billListQuerySchema.parse(request.query);
    return listBills(query);
  });

  app.post("/bills", async (request, reply) => {
    const body = createBillSchema.parse(request.body);
    const bill = await createBill(body);
    reply.status(201);
    return bill;
  });

  app.get<{ Params: { id: string } }>("/bills/:id", async (request) => {
    billDetailQuerySchema.parse(request.query);
    return getBillDetail(request.params.id);
  });

  app.patch<{ Params: { id: string } }>("/bills/:id", async (request) => {
    const body = patchBillSchema.parse(request.body);
    return patchBill(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/bills/:id", async (request, reply) => {
    await deleteBill(request.params.id);
    reply.status(204);
  });
}
