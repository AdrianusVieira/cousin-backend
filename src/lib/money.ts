/**
 * Money crosses the API as decimal strings ("1234.56") and is stored as
 * numeric(14,2). Arithmetic is done in integer cents to avoid float drift.
 */

const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export function toCents(money: string): number {
  if (!MONEY_PATTERN.test(money)) {
    throw new Error(`Invalid money string: ${money}`);
  }
  const [whole, fraction = ""] = money.split(".");
  const cents = fraction.padEnd(2, "0");
  return Number(`${whole}${cents}`);
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const fraction = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}
