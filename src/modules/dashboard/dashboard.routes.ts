import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDashboardDetails } from "./dashboard.details.js";
import { getDashboard } from "./dashboard.service.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date");

const dashboardQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/details", async (request) => {
    const query = z
      .object({
        from: isoDate,
        to: isoDate,
        metric: z.enum(["income", "outcome", "net", "savingsRate"]),
      })
      .refine((value) => value.from <= value.to, { message: "from must be before to" })
      .parse(request.query);
    return getDashboardDetails(query);
  });
  app.get("/dashboard", async (request) => {
    const query = dashboardQuerySchema.parse(request.query);
    return getDashboard(query);
  });
}
