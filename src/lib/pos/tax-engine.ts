/**
 * Tax Engine — pure functions, Avalara-grade.
 * Sprint E: per-item tax codes, customer exemptions, holidays, per-outlet overrides,
 * multi-tax stacking (WET on top of GST), inclusive vs exclusive pricing.
 */

export interface TaxCode {
  id: string
  code: string
  name: string
  rate: number
  category: 'standard' | 'reduced' | 'zero' | 'exempt' | 'special' | 'luxury'
  is_inclusive: boolean
  applies_on_top_of_tax_code_id: string | null
  is_active: boolean
}

export interface OutletTaxOverride {
  tax_code_id: string
  rate_override: number | null
  is_active: boolean
}

export interface TaxHoliday {
  starts_at: string
  ends_at: string
  affected_tax_code_ids: string[]
  affected_category_ids: string[]
  affected_product_ids: string[]
  is_active: boolean
}

export interface TaxableLine {
  product_id: string
  category_id: string | null
  quantity: number
  unit_price: number               // what the customer sees
  line_subtotal: number            // unit_price * quantity (pre-discount)
  discount_amount: number          // already-applied discount
  tax_code_id: string | null
  additional_tax_code_ids: string[] | null
  tax_exempted?: boolean
  tax_exempt_reason?: string
}

export interface CustomerForTax {
  id: string
  tax_exempt: boolean
  tax_exempt_type: string | null
  tax_exempt_expires_at: string | null
}

export interface TaxLineResult {
  tax_code_id: string
  code: string
  name: string
  rate: number
  taxable_amount: number
  tax_amount: number
}

export interface ItemTaxResult {
  line_subtotal_excl_tax: number
  line_subtotal_incl_tax: number
  total_tax: number
  tax_breakdown: TaxLineResult[]
  tax_exempted: boolean
  tax_exempt_reason: string | null
}

export interface SaleTaxResult {
  subtotal_excl_tax: number
  subtotal_incl_tax: number
  total_tax: number
  tax_breakdown: TaxLineResult[]    // aggregated across items
  per_item: Record<string, ItemTaxResult>  // keyed by product_id (use index for duplicates)
}

function isHolidayActive(holiday: TaxHoliday, now: Date): boolean {
  if (!holiday.is_active) return false
  return new Date(holiday.starts_at) <= now && new Date(holiday.ends_at) >= now
}

function isCodeSuspended(taxCodeId: string, line: TaxableLine, holidays: TaxHoliday[], now: Date): boolean {
  for (const h of holidays) {
    if (!isHolidayActive(h, now)) continue
    if (h.affected_tax_code_ids?.includes(taxCodeId)) return true
    if (line.category_id && h.affected_category_ids?.includes(line.category_id)) return true
    if (h.affected_product_ids?.includes(line.product_id)) return true
  }
  return false
}

function isCustomerExempt(customer: CustomerForTax | null, now: Date): boolean {
  if (!customer || !customer.tax_exempt) return false
  if (customer.tax_exempt_expires_at) {
    if (new Date(customer.tax_exempt_expires_at) < now) return false
  }
  return true
}

function resolveRate(code: TaxCode, outletOverrides: OutletTaxOverride[]): number {
  const ov = outletOverrides.find(o => o.tax_code_id === code.id && o.is_active)
  if (ov && ov.rate_override !== null) return Number(ov.rate_override) || 0
  return Number(code.rate) || 0
}

/**
 * Compute tax for a single line.
 *
 * Multiple tax codes stack additively on the same taxable base:
 *   WET (29% non-inclusive) + GST (10% inclusive) on a $100 wine bottle =
 *     base $100 → WET 29 → subtotal $129 → GST on $129 = $12.90 →
 *     total $141.90 with tax_breakdown showing both lines.
 *
 * If primary code is_inclusive=true, the line_subtotal is treated as
 * tax-inclusive; we back out the tax. If non-inclusive, tax is added on top.
 */
export function computeLineTax(
  line: TaxableLine,
  primaryCode: TaxCode | null,
  additionalCodes: TaxCode[],
  outletOverrides: OutletTaxOverride[],
  holidays: TaxHoliday[],
  customer: CustomerForTax | null,
  now: Date = new Date()
): ItemTaxResult {
  const lineNet = (Number(line.line_subtotal) || 0) - (Number(line.discount_amount) || 0)

  // Exempt: line-level flag, customer exemption, or no tax code
  if (line.tax_exempted || isCustomerExempt(customer, now) || !primaryCode) {
    return {
      line_subtotal_excl_tax: lineNet,
      line_subtotal_incl_tax: lineNet,
      total_tax: 0,
      tax_breakdown: [],
      tax_exempted: true,
      tax_exempt_reason: line.tax_exempt_reason
        ?? (customer?.tax_exempt ? `Customer ${customer.tax_exempt_type ?? 'exempt'}` : 'No tax code'),
    }
  }

  const breakdown: TaxLineResult[] = []
  let baseExcl = lineNet
  let baseIncl = lineNet

  // Primary code first
  if (!isCodeSuspended(primaryCode.id, line, holidays, now)) {
    const rate = resolveRate(primaryCode, outletOverrides)
    if (primaryCode.is_inclusive) {
      // line_subtotal is tax-inclusive; back it out
      const taxAmount = lineNet - lineNet / (1 + rate / 100)
      baseExcl = lineNet - taxAmount
      baseIncl = lineNet
      breakdown.push({
        tax_code_id: primaryCode.id, code: primaryCode.code, name: primaryCode.name,
        rate, taxable_amount: +baseExcl.toFixed(2), tax_amount: +taxAmount.toFixed(2),
      })
    } else {
      // Tax added on top
      const taxAmount = lineNet * (rate / 100)
      baseExcl = lineNet
      baseIncl = lineNet + taxAmount
      breakdown.push({
        tax_code_id: primaryCode.id, code: primaryCode.code, name: primaryCode.name,
        rate, taxable_amount: +baseExcl.toFixed(2), tax_amount: +taxAmount.toFixed(2),
      })
    }
  }

  // Additional codes stack on the EXCL-tax base
  for (const addCode of additionalCodes) {
    if (isCodeSuspended(addCode.id, line, holidays, now)) continue
    const rate = resolveRate(addCode, outletOverrides)
    const taxAmount = baseExcl * (rate / 100)
    baseIncl += taxAmount
    breakdown.push({
      tax_code_id: addCode.id, code: addCode.code, name: addCode.name,
      rate, taxable_amount: +baseExcl.toFixed(2), tax_amount: +taxAmount.toFixed(2),
    })
  }

  const totalTax = breakdown.reduce((s, b) => s + b.tax_amount, 0)
  return {
    line_subtotal_excl_tax: +baseExcl.toFixed(2),
    line_subtotal_incl_tax: +baseIncl.toFixed(2),
    total_tax: +totalTax.toFixed(2),
    tax_breakdown: breakdown,
    tax_exempted: false,
    tax_exempt_reason: null,
  }
}

/**
 * Aggregate sale tax across all lines.
 */
export function computeSaleTax(
  lines: TaxableLine[],
  taxCodes: TaxCode[],
  outletOverrides: OutletTaxOverride[],
  holidays: TaxHoliday[],
  customer: CustomerForTax | null,
  now: Date = new Date()
): SaleTaxResult {
  const codeMap = new Map(taxCodes.map(c => [c.id, c]))
  const aggregated = new Map<string, TaxLineResult>()
  const perItem: Record<string, ItemTaxResult> = {}
  let subExcl = 0, subIncl = 0, totalTax = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const primary = line.tax_code_id ? codeMap.get(line.tax_code_id) ?? null : null
    const additional = (line.additional_tax_code_ids ?? [])
      .map(id => codeMap.get(id))
      .filter((c): c is TaxCode => !!c)

    const result = computeLineTax(line, primary, additional, outletOverrides, holidays, customer, now)
    perItem[`${line.product_id}_${i}`] = result
    subExcl += result.line_subtotal_excl_tax
    subIncl += result.line_subtotal_incl_tax
    totalTax += result.total_tax

    for (const b of result.tax_breakdown) {
      const existing = aggregated.get(b.tax_code_id)
      if (existing) {
        existing.taxable_amount = +(existing.taxable_amount + b.taxable_amount).toFixed(2)
        existing.tax_amount = +(existing.tax_amount + b.tax_amount).toFixed(2)
      } else {
        aggregated.set(b.tax_code_id, { ...b })
      }
    }
  }

  return {
    subtotal_excl_tax: +subExcl.toFixed(2),
    subtotal_incl_tax: +subIncl.toFixed(2),
    total_tax: +totalTax.toFixed(2),
    tax_breakdown: Array.from(aggregated.values()),
    per_item: perItem,
  }
}
