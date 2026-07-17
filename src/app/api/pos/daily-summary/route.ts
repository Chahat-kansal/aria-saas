export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import {
  computeDailyTotals,
  paymentBreakdown,
  hourlyHistogram,
  topProducts,
  compareToBaseline,
  type SaleRow,
  type SaleItemRow,
} from '@/lib/pos/sales-stats'

async function _GET(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const baselineOffsetDays = Math.max(1, Number(searchParams.get('baseline_offset_days')) || 7)

  // Default: today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
  const starts_at = searchParams.get('starts_at') ?? todayStart.toISOString()
  const ends_at = searchParams.get('ends_at') ?? todayEnd.toISOString()

  // Baseline window
  const baseStart = new Date(starts_at)
  baseStart.setDate(baseStart.getDate() - baselineOffsetDays)
  const baseEnd = new Date(ends_at)
  baseEnd.setDate(baseEnd.getDate() - baselineOffsetDays)

  const [todayRes, baselineRes] = await Promise.all([
    supabase.from('pos_sales')
      .select('id, sale_number, total_amount, subtotal, tax_amount, discount_amount, payment_method, status, created_at, served_by')
      .eq('business_id', bid)
      .gte('created_at', starts_at)
      .lte('created_at', ends_at),
    supabase.from('pos_sales')
      .select('id, sale_number, total_amount, subtotal, tax_amount, discount_amount, payment_method, status, created_at, served_by')
      .eq('business_id', bid)
      .gte('created_at', baseStart.toISOString())
      .lte('created_at', baseEnd.toISOString()),
  ])

  const todaySales = (todayRes.data ?? []) as SaleRow[]
  const baselineSales = (baselineRes.data ?? []) as SaleRow[]

  // Fetch items for today
  const saleIds = todaySales.map(s => s.id)
  let todayItems: SaleItemRow[] = []
  if (saleIds.length > 0) {
    const { data: items } = await supabase.from('pos_sale_items')
      .select('sale_id, product_id, product_name, quantity, line_total')
      .in('sale_id', saleIds)
    todayItems = (items ?? []) as SaleItemRow[]
  }

  const todayTotals = computeDailyTotals(todaySales)
  const baselineTotals = computeDailyTotals(baselineSales)

  return NextResponse.json(
    {
      totals: todayTotals,
      baseline: baselineTotals,
      comparison: compareToBaseline(todayTotals, baselineTotals),
      payment_breakdown: paymentBreakdown(todaySales),
      hourly: hourlyHistogram(todaySales),
      top_products: topProducts(todayItems, 10),
      period: { starts_at, ends_at },
      baseline_period: { starts_at: baseStart.toISOString(), ends_at: baseEnd.toISOString() },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export const GET = withBusinessContext('pos/daily-summary', _GET)
