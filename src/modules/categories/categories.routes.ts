import type { FastifyInstance } from "fastify";
import {
  categoryDetailQuerySchema,
  categoryListQuerySchema,
  createCategorySchema,
  patchCategorySchema,
} from "./categories.schema.js";
import {
  createCategory,
  getCategoryDetail,
  listCategories,
  patchCategory,
  setCategoryArchiveStatus,
} from "./categories.service.js";

export async function registerCategoryRoutes(app: FastifyInstance) {
  app.get("/categories", async (request) => {
    const query = categoryListQuerySchema.parse(request.query);
    return listCategories(query);
  });

  app.post("/categories", async (request, reply) => {
    const body = createCategorySchema.parse(request.body);
    const category = await createCategory(body);
    reply.status(201);
    return category;
  });

  app.get<{ Params: { id: string } }>("/categories/:id", async (request) => {
    const query = categoryDetailQuerySchema.parse(request.query);
    return getCategoryDetail(request.params.id, query);
  });

  app.patch<{ Params: { id: string } }>("/categories/:id", async (request) => {
    const body = patchCategorySchema.parse(request.body);
    return patchCategory(request.params.id, body);
  });

  app.post<{ Params: { id: string } }>("/categories/:id/archive", async (request) => {
    return setCategoryArchiveStatus(request.params.id, true);
  });

  app.post<{ Params: { id: string } }>("/categories/:id/unarchive", async (request) => {
    return setCategoryArchiveStatus(request.params.id, false);
  });
}
