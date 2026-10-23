import { describe, expect, it } from "vitest";
import { createTransactionSchema } from "./transactions.schema.js";
const id = "11111111-1111-4111-8111-111111111111";
describe("transaction category requirement", () => {
  it.each(["debit", "credit"])("requires a category for %s creation", (method) => {
    const body = {
      method,
      amount: "12.34",
      date: "2026-10-22",
      fromType: "wallet",
      fromId: id,
      toType: "external",
    };
    expect(createTransactionSchema.safeParse(body).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...body, categoryId: id }).success).toBe(true);
  });
});
