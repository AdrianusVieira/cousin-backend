import { z } from "zod";

const uuid = z.string().uuid("Must be a valid UUID");

export const creditListQuerySchema = z.object({
  status: z.enum(["all", "settled", "unsettled"]).optional(),
});

export const settleSchema = z.object({
  transactionIds: z.array(uuid).min(1, "At least one transaction ID is required"),
});

export type CreditListQuery = z.infer<typeof creditListQuerySchema>;
export type SettleInput = z.infer<typeof settleSchema>;
