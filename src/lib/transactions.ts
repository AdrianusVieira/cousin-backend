export type TxnFromType = "wallet" | "external" | "revenue";
export type TxnToType = "wallet" | "external" | "bill";
export type TxnMethod = "debit" | "credit";

export type TxnKind =
  | "moneyIn"
  | "moneyOut"
  | "revenueRealized"
  | "billPaid"
  | "internalTransfer"
  | "manualAdjustment";

export type TxnSign = "+" | "-" | null;

interface TxnEndpoints {
  fromType: TxnFromType;
  fromId: string | null;
  toType: TxnToType;
  toId: string | null;
}

/**
 * The six legal from/to combinations from glossary.md, with the kind and sign
 * each implies. Returns null for any other combination (invalid -> 422).
 */
export function classifyTransaction({
  fromType,
  fromId,
  toType,
  toId,
}: TxnEndpoints): { kind: TxnKind; sign: TxnSign } | null {
  if (fromType === "external" && toType === "wallet") return { kind: "moneyIn", sign: "+" };
  if (fromType === "wallet" && toType === "external") return { kind: "moneyOut", sign: "-" };
  if (fromType === "revenue" && toType === "wallet")
    return { kind: "revenueRealized", sign: "+" };
  if (fromType === "wallet" && toType === "bill") return { kind: "billPaid", sign: "-" };
  if (fromType === "wallet" && toType === "wallet") {
    return fromId === toId
      ? { kind: "manualAdjustment", sign: null }
      : { kind: "internalTransfer", sign: null };
  }
  return null;
}

/**
 * The signed change `transaction` applies to `walletId`'s balance.
 *
 * A credit purchase moves no money when it is made - only when its statement is
 * settled, at which point the full amount leaves the wallet it was drawn from.
 * An unsettled credit transaction therefore returns 0.
 *
 * Manual adjustments (from === to === walletId) store the signed delta directly
 * in `amount` - applying both legs would cancel out to zero.
 */
export function walletBalanceDelta(
  transaction: TxnEndpoints & { method: TxnMethod; amount: number; settled?: boolean },
  walletId: string,
): number {
  if (transaction.method === "credit") {
    if (!transaction.settled) return 0;

    const isDrawnOnThisWallet =
      transaction.fromType === "wallet" && transaction.fromId === walletId;
    return isDrawnOnThisWallet ? -transaction.amount : 0;
  }

  const isFromThisWallet = transaction.fromType === "wallet" && transaction.fromId === walletId;
  const isToThisWallet = transaction.toType === "wallet" && transaction.toId === walletId;

  if (isFromThisWallet && isToThisWallet) return transaction.amount;

  let delta = 0;
  if (isFromThisWallet) delta -= transaction.amount;
  if (isToThisWallet) delta += transaction.amount;
  return delta;
}
