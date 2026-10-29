/**
 * Money helpers. ALL amounts in SAQR are integers in piasters (100 = 1 EGP).
 * Floats are never used for stored or calculated money; they only appear
 * inside formatEgp() for display.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertPiasters(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer number of piasters`);
  }
  return value;
}

/** Parse a decimal EGP string such as "125.50" into piasters (12550). */
export function parseEgp(input: string): number {
  const trimmed = input.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) {
    throw new MoneyError("Invalid EGP amount");
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function addMoney(...values: number[]): number {
  let total = 0;
  for (const v of values) total += assertPiasters(v);
  return assertPiasters(total, "sum");
}

/**
 * Apply basis points (800 = 8.00%) to an amount, rounding half up.
 * Integer math only, so results are exact and reproducible.
 */
export function applyBasisPoints(piasters: number, basisPoints: number): number {
  assertPiasters(piasters, "amount");
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new MoneyError("basisPoints must be an integer between 0 and 10000");
  }
  const product = piasters * basisPoints;
  assertPiasters(product, "intermediate product");
  return Math.floor((product + 5_000) / 10_000);
}

/** Display only. Never feed the result back into calculations. */
export function formatEgp(piasters: number, locale = "ar-EG"): string {
  assertPiasters(piasters);
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EGP" }).format(
    piasters / 100,
  );
}
