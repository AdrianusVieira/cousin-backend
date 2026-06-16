import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDashboard } from "./dashboard.service.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date");

const dashboardQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", async (request) => {
    const query = dashboardQuerySchema.parse(request.query);
    return getDashboard(query);
  });
}
