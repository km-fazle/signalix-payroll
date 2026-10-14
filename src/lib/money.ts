import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function parseAmount(value: string | null | undefined): Decimal | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return null;
  const amount = new Decimal(trimmed);
  if (!amount.isFinite() || amount.lte(0)) return null;
  return amount;
}

export function formatStoredAmount(value: string | number | Decimal | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Decimal) return value.toDecimalPlaces(2).eq(value) ? value.toFixed(2) : null;
  const trimmed = String(value).trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return null;
  const amount = new Decimal(trimmed);
  const cents = amount.toDecimalPlaces(2);
  if (!amount.eq(cents)) return null;
  return cents.toFixed(2);
}

export function formatAmount(value: string | number | Decimal | null | undefined): string | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Decimal ? value : parseAmount(String(value));
  if (!parsed) return null;
  return parsed.toFixed(2);
}

export function parseHours(value: string | null | undefined): Decimal | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return null;
  const hours = new Decimal(trimmed);
  if (!hours.isFinite() || hours.lte(0) || hours.gt(168)) return null;
  return hours;
}

export function formatHours(value: string | number | Decimal | null | undefined): string | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Decimal ? value : parseHours(String(value));
  if (!parsed) return null;
  return parsed.toFixed(2);
}
