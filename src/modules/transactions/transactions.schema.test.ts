import { describe, expect, it } from "vitest";
import { createTransactionSchema, patchTransactionSchema } from "./transactions.schema.js";
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

const secondId = "22222222-2222-4222-8222-222222222222";
const transaction = {
  method: "debit",
  amount: "100.01",
  date: "2026-10-23",
  fromType: "wallet",
  fromId: id,
  toType: "external",
};
const allocations = [
  { categoryId: id, amount: "70.01" },
  { categoryId: secondId, amount: "30.00" },
];
describe("category allocations", () => {
  it.each(["debit", "credit"])("accepts explicitly entered unequal amounts for %s", (method) => {
    expect(
      createTransactionSchema.parse({ ...transaction, method, categoryAllocations: allocations })
        .categoryAllocations,
    ).toEqual(allocations);
  });
  it("uses exact cents rather than floating point addition", () => {
    expect(
      createTransactionSchema.safeParse({
        ...transaction,
        amount: "0.30",
        categoryAllocations: [
          { categoryId: id, amount: "0.10" },
          { categoryId: secondId, amount: "0.20" },
        ],
      }).success,
    ).toBe(true);
  });
  it.each(["30.01", "29.99"])("rejects totals that are off by one cent (%s)", (amount) => {
    expect(
      createTransactionSchema.safeParse({
        ...transaction,
        categoryAllocations: [allocations[0], { categoryId: secondId, amount }],
      }).success,
    ).toBe(false);
  });
  it.each(["0", "-1", "1.001", "abc", ""])(
    "rejects an invalid allocation amount (%s)",
    (amount) => {
      expect(
        createTransactionSchema.safeParse({
          ...transaction,
          categoryAllocations: [{ categoryId: id, amount }],
        }).success,
      ).toBe(false);
    },
  );
  it("rejects duplicate categories", () => {
    expect(
      createTransactionSchema.safeParse({
        ...transaction,
        categoryAllocations: [allocations[0], { categoryId: id, amount: "30.00" }],
      }).success,
    ).toBe(false);
  });
  it("rejects ambiguous legacy and allocation fields", () => {
    expect(
      createTransactionSchema.safeParse({
        ...transaction,
        categoryId: id,
        categoryAllocations: allocations,
      }).success,
    ).toBe(false);
    expect(
      patchTransactionSchema.safeParse({ categoryId: null, categoryAllocations: [] }).success,
    ).toBe(false);
  });
  it("allows explicitly clearing historical categorization", () => {
    expect(patchTransactionSchema.parse({ categoryAllocations: [] })).toEqual({
      categoryAllocations: [],
    });
  });
});
