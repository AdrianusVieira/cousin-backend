import type { FastifyInstance } from "fastify";
import {
  createRevenueSchema,
  patchRevenueSchema,
  revenueDetailQuerySchema,
  revenueListQuerySchema,
} from "./revenues.schema.js";
import {
  createRevenue,
  deleteRevenue,
  getRevenueDetail,
  listRevenues,
  patchRevenue,
} from "./revenues.service.js";

export async function registerRevenueRoutes(app: FastifyInstance) {
  app.get("/revenues", async (request) => {
    const query = revenueListQuerySchema.parse(request.query);
    return listRevenues(query);
  });

  app.post("/revenues", async (request, reply) => {
    const body = createRevenueSchema.parse(request.body);
    const revenue = await createRevenue(body);
    reply.status(201);
    return revenue;
  });

  app.get<{ Params: { id: string } }>("/revenues/:id", async (request) => {
    revenueDetailQuerySchema.parse(request.query);
    return getRevenueDetail(request.params.id);
  });

  app.patch<{ Params: { id: string } }>("/revenues/:id", async (request) => {
    const body = patchRevenueSchema.parse(request.body);
    return patchRevenue(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/revenues/:id", async (request, reply) => {
    await deleteRevenue(request.params.id);
    reply.status(204);
  });
}
