import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date");
const uuid = z.string().uuid("Must be a valid UUID");

export const creditListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.enum(["all", "settled", "unsettled"]).optional(),
});

export const settleSchema = z.object({
  transactionIds: z.array(uuid).min(1, "At least one transaction ID is required"),
});

export type CreditListQuery = z.infer<typeof creditListQuerySchema>;
export type SettleInput = z.infer<typeof settleSchema>;
