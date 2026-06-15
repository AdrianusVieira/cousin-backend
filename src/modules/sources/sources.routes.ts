import type { FastifyInstance } from "fastify";
import {
  createSourceSchema,
  patchSourceSchema,
  sourceDetailQuerySchema,
  sourceListQuerySchema,
} from "./sources.schema.js";
import {
  createSource,
  getSourceDetail,
  listSources,
  patchSource,
  setSourceArchiveStatus,
} from "./sources.service.js";

export async function registerSourceRoutes(app: FastifyInstance) {
  app.get("/sources", async (request) => {
    const query = sourceListQuerySchema.parse(request.query);
    return listSources(query);
  });

  app.post("/sources", async (request, reply) => {
    const body = createSourceSchema.parse(request.body);
    const source = await createSource(body);
    reply.status(201);
    return source;
  });

  app.get<{ Params: { id: string } }>("/sources/:id", async (request) => {
    const query = sourceDetailQuerySchema.parse(request.query);
    return getSourceDetail(request.params.id, query);
  });

  app.patch<{ Params: { id: string } }>("/sources/:id", async (request) => {
    const body = patchSourceSchema.parse(request.body);
    return patchSource(request.params.id, body);
  });

  app.post<{ Params: { id: string } }>("/sources/:id/archive", async (request) => {
    return setSourceArchiveStatus(request.params.id, true);
  });

  app.post<{ Params: { id: string } }>("/sources/:id/unarchive", async (request) => {
    return setSourceArchiveStatus(request.params.id, false);
  });
}
