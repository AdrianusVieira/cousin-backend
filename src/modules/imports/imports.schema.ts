import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date, e.g. '2026-06-15'");
const uuid = z.string().uuid("Must be a valid UUID");
// Signed, unlike transactions.schema's moneyString — a negative row (e.g. an auto-payment) must
// reach the service layer intact so it can be classified as a business-level skip, not rejected here.
const signedMoneyString = z
  .string()
  .regex(/^-?\d+\.\d{2}$/, "Must be a decimal string with exactly 2 decimal places, e.g. '1234.56' or '-42.00'");

const importRowSchema = z
  .object({
    amount: signedMoneyString,
    date: isoDate,
    description: z.string().max(500).optional(),
    installmentNumber: z.number().int().min(1).optional(),
    installmentTotal: z.number().int().min(1).optional(),
  })
  .refine(
    (v) => (v.installmentNumber === undefined) === (v.installmentTotal === undefined),
    { message: "installmentNumber and installmentTotal must both be present or both absent" },
  )
  .refine(
    (v) => v.installmentTotal === undefined || v.installmentNumber! <= v.installmentTotal,
    { message: "installmentNumber cannot exceed installmentTotal" },
  );

export const importTransactionsSchema = z.object({
  rows: z.array(importRowSchema).min(1, "At least one row is required").max(1000, "Too many rows in one import"),
  walletId: uuid,
});

export type ImportRowInput = z.infer<typeof importRowSchema>;
export type ImportTransactionsInput = z.infer<typeof importTransactionsSchema>;
