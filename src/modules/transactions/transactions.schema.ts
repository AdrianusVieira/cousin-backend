import { z } from "zod";
import { toCents } from "../../lib/money.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date, e.g. '2026-06-15'");
const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal string, e.g. '1234.56'");
const uuid = z.string().uuid("Must be a valid UUID");
const categoryAllocations = z
  .array(
    z.object({
      categoryId: uuid,
      amount: moneyString.refine(
        (value) => /^\d+(\.\d{1,2})?$/.test(value) && toCents(value) > 0,
        "Must be greater than zero",
      ),
    }),
  )
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.categoryId)).size === items.length,
    "Choose each category only once",
  );

const debitTransactionSchema = z.object({
  amount: moneyString,
  categoryId: uuid.optional(),
  categoryAllocations: categoryAllocations.optional(),
  date: isoDate,
  description: z.string().optional(),
  fromId: uuid.optional(),
  fromType: z.enum(["wallet", "external", "revenue"]),
  method: z.literal("debit"),
  toId: uuid.optional(),
  toType: z.enum(["wallet", "external", "bill"]),
});

const creditTransactionSchema = z.object({
  amount: moneyString,
  categoryId: uuid.optional(),
  categoryAllocations: categoryAllocations.optional(),
  date: isoDate,
  description: z.string().optional(),
  fromId: uuid,
  installmentTotal: z.number().int().min(2).optional(),
  method: z.literal("credit"),
  term: isoDate.optional(),
  toId: uuid.optional(),
  toType: z.enum(["wallet", "external", "bill"]),
});

export const createTransactionSchema = z
  .discriminatedUnion("method", [debitTransactionSchema, creditTransactionSchema])
  .superRefine((value, ctx) => {
    if (!value.categoryId && !value.categoryAllocations?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryAllocations"],
        message: "Choose at least one active category",
      });
    }
    if (value.categoryId && value.categoryAllocations !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryAllocations"],
        message: "Use categoryId or categoryAllocations, not both",
      });
    }
    if (
      value.categoryAllocations?.length &&
      /^\d+(\.\d{1,2})?$/.test(value.amount) &&
      value.categoryAllocations.every((item) => /^\d+(\.\d{1,2})?$/.test(item.amount)) &&
      value.categoryAllocations.reduce((sum, item) => sum + toCents(item.amount), 0) !==
        toCents(value.amount)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryAllocations"],
        message: "Category amounts must add up to the transaction amount",
      });
    }
  });

export const patchTransactionSchema = z
  .object({
    amount: moneyString.optional(),
    categoryId: uuid.nullable().optional(),
    categoryAllocations: categoryAllocations.optional(),
    date: isoDate.optional(),
    description: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.amount !== undefined ||
      v.date !== undefined ||
      "description" in v ||
      "categoryId" in v ||
      v.categoryAllocations !== undefined,
    { message: "At least one field is required" },
  )
  .refine((value) => !("categoryId" in value && value.categoryAllocations !== undefined), {
    path: ["categoryAllocations"],
    message: "Use categoryId or categoryAllocations, not both",
  });

export const transactionListQuerySchema = z.object({
  category: z.union([uuid, z.literal("uncategorized")]).optional(),
  cursor: z.string().optional(),
  from: isoDate.optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
  method: z.enum(["all", "debit", "credit"]).optional(),
  search: z.string().trim().max(200).optional(),
  to: isoDate.optional(),
  wallet: uuid.optional(),
});

export const bulkCategorySchema = z.object({
  categoryId: uuid,
  transactionIds: z.array(uuid).min(1).max(200),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type PatchTransactionInput = z.infer<typeof patchTransactionSchema>;
