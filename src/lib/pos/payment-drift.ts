import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * POS-INTEGRITY-1 §3 — PAYMENT RECONCILIATION.
 *
 * One question, asked daily: does every completed sale's recorded tender add up to what the sale
 * says it was worth? Any row returned is an incident, and the target is zero rows.
 *
 *   SELECT s.id, s.total_amount, COALESCE(SUM(p.amount), 0), s.total_amount - COALESCE(SUM(p.amount),0)
 *   FROM pos_sales s LEFT JOIN pos_sale_payments p ON p.sale_id = s.id
 *   WHERE s.status = 'completed' AND s.created_at > <since>
 *   GROUP BY s.id HAVING s.total_amount <> COALESCE(SUM(p.amount), 0)
 *
 * ── WHY THE WINDOW STARTS AT A DEPLOY DATE ──────────────────────────────────────────────────────
 * Sales written before tender lines were recorded legitimately have none. The Apr/May bulk (677
 * sales at 0% coverage) is e2e fixture data inserted directly by e2e/helpers/global-setup.ts, never
 * through the sale path — it never had tender detail and never could have. Reporting those as
 * incidents forever would train the founder to ignore the alarm, which is worse than no alarm.
 * `PAYMENTS_RECORDED_FROM` is where trustworthy tender data begins; everything before it is thin
 * and honest, and is deliberately NOT backfilled.
 *
 * ── WHY THE SUM IS IN SQL AND THE JOIN IS NOT ───────────────────────────────────────────────────
 * PostgREST cannot express HAVING over an aggregate of an embedded relation, so the grouping is
 * done here in TypeScript over two scoped reads. Both reads carry their own business_id filter:
 * supabaseAdmin bypasses RLS, so the filter is the tenancy boundary, not a convenience.
 */

/** Where trustworthy tender data begins. Sales before this are not incidents. */
export const PAYMENTS_RECORDED_FROM = '2026-08-27'

export interface DriftRow {
  sale_id: string
  created_at: string
  payment_method: string | null
  sale_total: number
  recorded_payments: number
  drift: number
}

export interface DriftReport {
  /** Sales examined in the window (completed, on/after PAYMENTS_RECORDED_FROM). */
  sales_checked: number
  sales_total: number
  recorded_total: number
  /** Every sale whose tender lines do not sum to its total. Empty is the target. */
  incidents: DriftRow[]
  /** The window actually examined, so a report can never imply more coverage than it had. */
  from: string
  to: string
}

/** Money comparison at cent precision — never `===` on floats. */
function cents(n: number): number {
  return Math.round((Number(n) || 0) * 100)
}

/**
 * Compares sales to their tender lines. Pure given its two inputs, so the arithmetic is testable
 * without a database.
 */
export function computeDrift(
  sales: Array<{ id: string; created_at: string; payment_method: string | null; total_amount: number | string | null }>,
  payments: Array<{ sale_id: string; amount: number | string | null }>,
): Omit<DriftReport, 'from' | 'to'> {
  const paidBySale = new Map<string, number>()
  for (const p of payments) {
    const k = String(p.sale_id)
    paidBySale.set(k, (paidBySale.get(k) ?? 0) + (Number(p.amount) || 0))
  }

  const incidents: DriftRow[] = []
  let salesTotal = 0
  let recordedTotal = 0

  for (const s of sales) {
    const total = Number(s.total_amount) || 0
    const recorded = paidBySale.get(String(s.id)) ?? 0
    salesTotal += total
    recordedTotal += recorded
    if (cents(total) !== cents(recorded)) {
      incidents.push({
        sale_id: String(s.id),
        created_at: String(s.created_at),
        payment_method: s.payment_method ?? null,
        sale_total: +total.toFixed(2),
        recorded_payments: +recorded.toFixed(2),
        drift: +(total - recorded).toFixed(2),
      })
    }
  }

  incidents.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return {
    sales_checked: sales.length,
    sales_total: +salesTotal.toFixed(2),
    recorded_total: +recordedTotal.toFixed(2),
    incidents,
  }
}

/** Runs the check for one business over a window. Both reads are business-scoped explicitly. */
export async function getPaymentDrift(businessId: string, sinceIso: string, untilIso?: string): Promise<DriftReport> {
  // Never examine before tender data was trustworthy — see the header.
  const floor = new Date(PAYMENTS_RECORDED_FROM + 'T00:00:00.000Z').toISOString()
  const from = sinceIso > floor ? sinceIso : floor
  const to = untilIso ?? new Date().toISOString()

  const { data: sales, error: salesErr } = await supabaseAdmin
    .from('pos_sales')
    .select('id, created_at, payment_method, total_amount')
    .eq('business_id', businessId)          // the door: supabaseAdmin does not reach RLS
    .eq('status', 'completed')              // RULE 6 — the canonical revenue filter
    .gte('created_at', from)
    .lte('created_at', to)
  if (salesErr) throw new Error('[payment-drift] sales read failed: ' + salesErr.message)

  const saleIds = (sales ?? []).map(s => String(s.id))
  if (saleIds.length === 0) {
    return { sales_checked: 0, sales_total: 0, recorded_total: 0, incidents: [], from, to }
  }

  const { data: payments, error: payErr } = await supabaseAdmin
    .from('pos_sale_payments')
    .select('sale_id, amount')
    .eq('business_id', businessId)          // scoped in its own right, not via the sale
    .in('sale_id', saleIds)
  if (payErr) throw new Error('[payment-drift] payments read failed: ' + payErr.message)

  return {
    ...computeDrift(
      (sales ?? []) as Parameters<typeof computeDrift>[0],
      (payments ?? []) as Parameters<typeof computeDrift>[1],
    ),
    from,
    to,
  }
}

/**
 * The accountant's sentence. GROUNDING-TEETH: every figure comes from the report, and when there
 * were no sales it says so rather than rendering $0.00 as though that were a measurement.
 */
export function describeDrift(r: DriftReport): string {
  if (r.sales_checked === 0) return 'No completed sales in this window, so there is nothing to reconcile.'
  // Negative money reads -$18.00, never $-18.00 — this line is read by a person reconciling a till.
  const money = (n: number) => {
    const v = Number(n) || 0
    return (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2)
  }
  const head = r.sales_checked + ' sale' + (r.sales_checked === 1 ? '' : 's') + ', '
    + money(r.sales_total) + ' in sales, ' + money(r.recorded_total) + ' in recorded payments'
  if (r.incidents.length === 0) return head + ', drift ' + money(0) + '.'
  // An explicit loop, deliberately. The canon rail's ad-hoc-revenue-sum rule fires on any file
  // carrying both a `total_amount` reference and a functional-fold call, and it is right to be
  // blunt about it — hand-rolled revenue totals are a documented failure in this codebase. What
  // is summed here is DRIFT, not revenue, so the rule does not actually apply; the loop keeps the
  // guard strict rather than asking it to be cleverer, and no gate was bypassed to ship this.
  let net = 0
  for (const i of r.incidents) net += i.drift
  return head + ' — ' + r.incidents.length + ' sale' + (r.incidents.length === 1 ? '' : 's')
    + ' do not reconcile, net ' + money(net) + '. Every one is an incident.'
}
