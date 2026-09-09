import type { FastifyInstance } from "fastify";
import { getLastUpdated } from "./meta.service.js";

export async function registerMetaRoutes(app: FastifyInstance) {
  app.get("/meta/last-updated", async () => {
    return getLastUpdated();
  });
}
