import { ValidationError } from "../../lib/errors.js";
import { toCents } from "../../lib/money.js";

export interface CategoryAllocationInput {
  categoryId: string;
  amount: string;
}

export function validateAllocationTotal(
  amount: string,
  allocations: CategoryAllocationInput[],
): void {
  if (
    allocations.length &&
    allocations.reduce((sum, item) => sum + toCents(item.amount), 0) !== toCents(amount)
  ) {
    throw new ValidationError({
      categoryAllocations: "Category amounts must add up to the transaction amount",
    });
  }
}
