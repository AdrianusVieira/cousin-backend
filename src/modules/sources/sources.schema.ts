import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date, e.g. '2026-06-15'");

export const createSourceSchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1, "Name is required"),
});

export const patchSourceSchema = z
  .object({
    description: z.string().optional(),
    name: z.string().min(1, "Name is required").optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "At least one field is required",
  });

export const sourceListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const sourceDetailQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type PatchSourceInput = z.infer<typeof patchSourceSchema>;
