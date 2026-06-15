import { z } from "zod";

const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Must be a decimal string, e.g. '1234.56'");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date, e.g. '2026-06-15'");

export const createWalletSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const patchWalletSchema = z
  .object({
    name: z.string().min(1, "Name is required").optional(),
    description: z.string().optional(),
    balance: moneyString.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const walletListQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const walletDetailQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type PatchWalletInput = z.infer<typeof patchWalletSchema>;
