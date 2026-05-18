import type { Recommendation, BusinessContext, ValidationResult } from './types'

export function validatePricing(rec: Recommendation, ctx: BusinessContext): ValidationResult {
  const p = ctx.product
  if (!p) return { ok: true }
  const current = Number(rec.payload.current_price) || p.price
  const suggested = Number(rec.payload.suggested_price) || current
  const deltaPct = current > 0 ? ((suggested - current) / current) * 100 : 0
  if (Math.abs(deltaPct) > 10) {
    return { ok: false, rejected_reason: `Price change ${deltaPct.toFixed(1)}% exceeds 10% per-step limit.`, severity: 'hard' }
  }
  if (p.cost_price > 0 && suggested < p.cost_price) {
    return { ok: false, rejected_reason: `Suggested price $${suggested.toFixed(2)} is below cost $${p.cost_price.toFixed(2)}.`, severity: 'hard' }
  }
  return { ok: true }
}

export function validateInventory(rec: Recommendation, ctx: BusinessContext): ValidationResult {
  const p = ctx.product
  if (!p) return { ok: true }
  if (rec.type === 'restock') {
    if (p.weeks_of_stock != null && p.weeks_of_stock >= 4) {
      return { ok: false, rejected_reason: `Already ${p.weeks_of_stock.toFixed(1)} weeks of stock — restock not needed.`, severity: 'hard' }
    }
    if (p.shelf_life_days && p.units_per_week > 0) {
      const maxWeeksCoverage = p.shelf_life_days / 7
      const requestedQty = Number(rec.payload.restock_qty) || 0
      const requestedWeeks = requestedQty / p.units_per_week
      if (requestedWeeks > maxWeeksCoverage * 1.2) {
        return {
          ok: false,
          rejected_reason: `Restock of ${requestedQty} units = ${requestedWeeks.toFixed(1)} weeks but shelf life is only ${maxWeeksCoverage.toFixed(1)} weeks. Waste risk.`,
          severity: 'soft',
          rewritten: {
            ...rec,
            payload: { ...rec.payload, restock_qty: Math.round(maxWeeksCoverage * p.units_per_week) },
            description: `${rec.description} (Reduced to fit shelf life.)`,
          },
        }
      }
    }
  }
  return { ok: true }
}

export function validateCompliance(_rec: Recommendation, _ctx: BusinessContext): ValidationResult {
  return { ok: true }
}
