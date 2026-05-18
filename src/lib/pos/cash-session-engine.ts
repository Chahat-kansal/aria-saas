export interface CashSessionInput {
  opening_float: number
  total_cash_sales: number
  total_refunds: number
  expected_cash_cents: number
  actual_cash_cents: number
}

export function computeExpectedCashCents(openingFloat: number, totalCashSales: number, totalRefunds: number): number {
  const expected = (Number(openingFloat) || 0) + (Number(totalCashSales) || 0) - (Number(totalRefunds) || 0)
  return Math.round(expected * 100)
}

export function computeVarianceCents(expectedCents: number, actualCents: number): number {
  return (Number(actualCents) || 0) - (Number(expectedCents) || 0)
}

export function classifyVariance(
  varianceCents: number,
  totalCashSalesDollars: number,
): 'balanced' | 'minor_short' | 'minor_over' | 'significant_short' | 'significant_over' {
  if (Math.abs(varianceCents) < 100) return 'balanced'
  const totalCashCents = Math.round((Number(totalCashSalesDollars) || 0) * 100)
  const pct = totalCashCents > 0 ? (Math.abs(varianceCents) / totalCashCents) * 100 : 0
  if (varianceCents < 0) return pct > 2 ? 'significant_short' : 'minor_short'
  return pct > 2 ? 'significant_over' : 'minor_over'
}
