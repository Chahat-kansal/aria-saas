// Canonical money helpers for Aria OS.
// Two unit systems coexist in the DB:
//   - Dollars  (numeric, no _cents suffix) → pos_sales.total_amount, invoices.total, etc.
//   - Cents     (integer, _cents suffix)    → pay_rate_cents, price_cents, etc.
// NEVER mix them. 100× errors are silent.

export function centsToDollars(cents: number | null | undefined): number {
  return (Number(cents) || 0) / 100
}

export function dollarsToCents(dollars: number | string | null | undefined): number {
  return Math.round((Number(dollars) || 0) * 100)
}

export function fmtCents(cents: number | null | undefined): string {
  return '$' + centsToDollars(cents).toFixed(2)
}

export function fmtDollars(dollars: number | string | null | undefined): string {
  return '$' + (Number(dollars) || 0).toFixed(2)
}

export function numericVal(v: number | string | null | undefined): number {
  return Number(v) || 0
}
