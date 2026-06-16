import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date");
const intervalUnit = z.enum(["day", "week", "month", "year"]);

export const patchRecurrenceSchema = z
  .object({
    intervalUnit: intervalUnit.optional(),
    intervalValue: z.number().int().min(1).optional(),
    isVariable: z.boolean().optional(),
    recurrentDay: z.number().int().min(1).max(31).optional(),
    recurrentMonth: z.number().int().min(1).max(12).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

export const recurrenceListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type PatchRecurrenceInput = z.infer<typeof patchRecurrenceSchema>;
