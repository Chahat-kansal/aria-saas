export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ reports: [] })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (id) {
    const { data } = await supabase.from('pos_shift_reports').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
    return NextResponse.json({ report: data ?? null })
  }
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
  const { data } = await supabase.from('pos_shift_reports').select('*').eq('business_id', bid).order('shift_end', { ascending: false }).limit(limit)
  const reports = data ?? []

  // Compute labour cost + ratio from timesheets overlapping each shift window
  const augmented = await Promise.all(reports.map(async (r: { shift_start: string; shift_end: string; total_revenue: number | null }) => {
    const { data: ts } = await supabase.from('pos_timesheets')
      .select('hours_worked, pay_rate_cents, total_pay_cents')
      .eq('business_id', bid)
      .gte('clock_in', r.shift_start)
      .lte('clock_in', r.shift_end);
    const totalHours = (ts ?? []).reduce((a, t: { hours_worked: number | null }) => a + Number(t.hours_worked ?? 0), 0);
    const labourCents = (ts ?? []).reduce((a, t: { hours_worked: number | null; pay_rate_cents: number | null; total_pay_cents: number | null }) => a + Number(t.total_pay_cents ?? Number(t.pay_rate_cents ?? 0) * Number(t.hours_worked ?? 0)), 0);
    const revenue = Number(r.total_revenue ?? 0);
    const ratio = revenue > 0 ? (labourCents / 100) / revenue * 100 : 0;
    return {
      ...r,
      labour_hours: Math.round(totalHours * 10) / 10,
      labour_cost_dollars: Math.round(labourCents / 100 * 100) / 100,
      labour_ratio_pct: Math.round(ratio * 10) / 10,
      revenue_per_hour: totalHours > 0 ? Math.round((revenue / totalHours) * 100) / 100 : 0,
    };
  }));

  return NextResponse.json({ reports: augmented })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { session_id?: string }
  if (!body.session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  const { data: session } = await supabaseAdmin.from('pos_cash_sessions').select('*').eq('id', body.session_id).eq('business_id', bid).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const shiftStart = String(session.opened_at)
  const shiftEnd = String(session.closed_at ?? new Date().toISOString())

  const { data: sales } = await supabaseAdmin.from('pos_sales')
    .select('id,total_amount,payment_method,status,created_at,served_by,pos_sale_items(quantity,unit_price,pos_products(name))')
    .eq('business_id', bid).eq('session_id', body.session_id)

  const validSales = (sales ?? []).filter((s: any) => s.status !== 'voided')
  const voidedSales = (sales ?? []).filter((s: any) => s.status === 'voided')
  const refunds = validSales.filter((s: any) => (s.total_amount ?? 0) < 0)
  const totalRevenue = validSales.reduce((s: number, x: any) => s + Math.max(0, Number(x.total_amount ?? 0)), 0)
  const avgBasket = validSales.length > 0 ? totalRevenue / validSales.length : 0

  const payBreakdown: Record<string, number> = {}
  for (const s of validSales) {
    const m = String(s.payment_method ?? 'cash')
    payBreakdown[m] = (payBreakdown[m] ?? 0) + Math.max(0, Number(s.total_amount ?? 0))
  }

  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {}
  for (const s of validSales) {
    for (const item of (s.pos_sale_items ?? []) as any[]) {
      const name = item.pos_products?.name ?? 'Unknown'
      if (!productMap[name]) productMap[name] = { name, qty: 0, revenue: 0 }
      productMap[name].qty += Number(item.quantity ?? 1)
      productMap[name].revenue += Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)
    }
  }
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const { data: timesheets } = await supabaseAdmin.from('pos_timesheets')
    .select('staff_name,hours_worked').eq('business_id', bid)
    .gte('clock_in', shiftStart).lte('clock_in', shiftEnd)
  const staffOnShift = (timesheets ?? []).map((t: any) => ({ name: t.staff_name, hours: t.hours_worked != null ? +(Number(t.hours_worked)).toFixed(1) : null }))

  const varianceCents = Number(session.variance_cents ?? 0)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let ariaSummary = ''
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      system: 'You are Aria. Write a 2-3 sentence end-of-shift summary for a business owner. Be specific and warm. Under 50 words.',
      messages: [{ role: 'user', content: `${validSales.length} transactions, A$${totalRevenue.toFixed(2)} revenue, avg A$${avgBasket.toFixed(2)}. Voids: ${voidedSales.length}. Refunds: ${refunds.length}. Cash variance: ${(varianceCents/100).toFixed(2)}. Top: ${topProducts[0]?.name ?? 'none'}.` }],
    })
    ariaSummary = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch { ariaSummary = `${validSales.length} transactions totalling A$${totalRevenue.toFixed(2)}.` }

  const { data: report, error } = await supabaseAdmin.from('pos_shift_reports').insert({
    business_id: bid, session_id: body.session_id,
    cashier_name: String(session.closed_by ?? session.opened_by ?? ''),
    shift_start: shiftStart, shift_end: shiftEnd,
    total_transactions: validSales.length, total_revenue: +totalRevenue.toFixed(2), avg_basket: +avgBasket.toFixed(2),
    total_refunds: refunds.length, total_refund_value: +Math.abs(refunds.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)).toFixed(2),
    total_voids: voidedSales.length,
    opening_float: Number(session.opening_float ?? 0), closing_float: Number(session.closing_float ?? 0),
    variance_cents: varianceCents, top_products: topProducts, payment_breakdown: payBreakdown,
    staff_on_shift: staffOnShift, aria_summary: ariaSummary,
    report_data: { session_id: body.session_id, shift_start: shiftStart, shift_end: shiftEnd, total_transactions: validSales.length, total_revenue: +totalRevenue.toFixed(2) },
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report, ok: true }, { status: 201 })
}

export const GET = withErrorCapture('pos/shift-reports', _GET)
export const POST = withErrorCapture('pos/shift-reports', _POST)
