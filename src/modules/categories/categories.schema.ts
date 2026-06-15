import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date, e.g. '2026-06-15'");

export const createCategorySchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1, "Name is required"),
});

export const patchCategorySchema = z
  .object({
    description: z.string().optional(),
    name: z.string().min(1, "Name is required").optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "At least one field is required",
  });

export const categoryListQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const categoryDetailQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type PatchCategoryInput = z.infer<typeof patchCategorySchema>;
