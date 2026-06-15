import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date, e.g. '2026-06-15'");
const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal string, e.g. '1234.56'");
const uuid = z.string().uuid("Must be a valid UUID");

const debitTransactionSchema = z.object({
  amount: moneyString,
  categoryId: uuid.optional(),
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
  date: isoDate,
  description: z.string().optional(),
  fromId: uuid,
  installmentTotal: z.number().int().min(2).optional(),
  method: z.literal("credit"),
  term: isoDate.optional(),
  toId: uuid.optional(),
  toType: z.enum(["wallet", "external", "bill"]),
});

export const createTransactionSchema = z.discriminatedUnion("method", [
  debitTransactionSchema,
  creditTransactionSchema,
]);

export const patchTransactionSchema = z
  .object({
    amount: moneyString.optional(),
    categoryId: uuid.nullable().optional(),
    date: isoDate.optional(),
    description: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.amount !== undefined ||
      v.date !== undefined ||
      "description" in v ||
      "categoryId" in v,
    { message: "At least one field is required" },
  );

export const transactionListQuerySchema = z.object({
  category: uuid.optional(),
  cursor: z.string().optional(),
  from: isoDate.optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
  method: z.enum(["all", "debit", "credit"]).optional(),
  to: isoDate.optional(),
  wallet: uuid.optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type PatchTransactionInput = z.infer<typeof patchTransactionSchema>;
