import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date, e.g. '2026-06-15'");
const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Must be a decimal string, e.g. '1234.56'");
const intervalUnit = z.enum(["day", "week", "month", "year"]);

const recurrenceInput = z
  .object({
    intervalUnit,
    intervalValue: z.number().int().positive(),
    isVariable: z.boolean(),
    recurrentDay: z.number().int().min(1).max(31),
    recurrentMonth: z.number().int().min(1).max(12).optional(),
  })
  .refine(
    (v) => v.intervalUnit !== "year" || v.recurrentMonth !== undefined,
    { message: "recurrentMonth is required when intervalUnit is 'year'" },
  );

export const createRevenueSchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  recurrence: recurrenceInput.optional(),
  sourceId: z.string().uuid("Must be a valid UUID"),
  term: isoDate,
  value: moneyString,
});

export const patchRevenueSchema = z
  .object({
    description: z.string().optional(),
    name: z.string().min(1).optional(),
    received: z.boolean().optional(),
    term: isoDate.optional(),
    value: moneyString.optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.value !== undefined ||
      v.term !== undefined ||
      v.description !== undefined ||
      v.received !== undefined,
    { message: "At least one field is required" },
  );

export const revenueListQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.enum(["all", "pending", "received", "overdue"]).optional(),
});

export const revenueDetailQuerySchema = z.object({});

export type CreateRevenueInput = z.infer<typeof createRevenueSchema>;
export type PatchRevenueInput = z.infer<typeof patchRevenueSchema>;
