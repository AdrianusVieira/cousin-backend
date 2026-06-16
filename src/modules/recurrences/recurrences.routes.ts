import type { FastifyInstance } from "fastify";
import { patchRecurrenceSchema, recurrenceListQuerySchema } from "./recurrences.schema.js";
import {
  deactivateRecurrence,
  getRecurrenceDetail,
  listRecurrences,
  patchRecurrenceConfig,
} from "./recurrences.service.js";

export async function registerRecurrenceRoutes(app: FastifyInstance) {
  app.get("/recurrences", async (request) => {
    const query = recurrenceListQuerySchema.parse(request.query);
    return listRecurrences(query);
  });

  app.get<{ Params: { id: string } }>("/recurrences/:id", async (request) => {
    return getRecurrenceDetail(request.params.id);
  });

  app.patch<{ Params: { id: string } }>("/recurrences/:id", async (request) => {
    const body = patchRecurrenceSchema.parse(request.body);
    return patchRecurrenceConfig(request.params.id, body);
  });

  app.post<{ Params: { id: string } }>(
    "/recurrences/:id/deactivate",
    async (request, reply) => {
      await deactivateRecurrence(request.params.id);
      reply.status(204);
    },
  );
}
