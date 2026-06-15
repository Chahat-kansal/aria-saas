export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// WIRE-4 — owner finance overview (read-only). P&L is COMPUTED on demand (not stored); cash
// forecast / reconciliations / expense anomalies are read from the tables the recon agent fills.
// COGS + operating expenses use business_expenses.expense_date (canonical, not `date`).
// Labour uses the SAME basis as WIRE-3 (pos_timesheets total_pay_cents ?? pay_rate_cents×hours).

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

const SUPPLIER_CAT = (c: string) => /supplier|stock|cogs|inventory|ingredient|produce/i.test(c)

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ empty: true })
  const db = supabaseAdmin

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const from = searchParams.get('from') ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = searchParams.get('to') ?? now.toISOString().slice(0, 10)
  const fromIso = from + 'T00:00:00.000Z', toIso = to + 'T23:59:59.999Z'

  const [salesQ, tsQ, expQ, extQ, forecastQ, reconQ, anomQ] = await Promise.all([
    db.from('pos_sales').select('total_amount').eq('business_id', bid).eq('status', 'completed').gte('created_at', fromIso).lte('created_at', toIso),
    db.from('pos_timesheets').select('hours_worked, total_pay_cents, pay_rate_cents').eq('business_id', bid).gte('clock_in', fromIso).lte('clock_in', toIso),
    db.from('business_expenses').select('amount, category, label').eq('business_id', bid).gte('expense_date', from).lte('expense_date', to),
    db.from('aria_external_costs').select('cost_cents').eq('business_id', bid).gte('created_at', fromIso).lte('created_at', toIso),
    db.from('cash_flow_forecasts').select('*').eq('business_id', bid).order('forecast_week', { ascending: false }).limit(1),
    db.from('daily_reconciliations').select('recon_date, pos_sales_total, pos_cash_total, pos_card_total, pos_other_total, variance_amount, variance_pct, status, bank_data_source, notes').eq('business_id', bid).order('recon_date', { ascending: false }).limit(14),
    db.from('expense_anomalies').select('expense_category, expense_description, amount, expected_range_low, expected_range_high, deviation_pct, possible_causes, status, created_at').eq('business_id', bid).eq('status', 'open').order('created_at', { ascending: false }).limit(20),
  ])

  const revenue = (salesQ.data ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const labour = (tsQ.data ?? []).reduce((s, t) => s + Number(t.total_pay_cents ?? (Number(t.pay_rate_cents ?? 0) * Number(t.hours_worked ?? 0))), 0) / 100
  let cogs = 0, opex = 0
  for (const e of expQ.data ?? []) { const amt = Number(e.amount ?? 0); if (SUPPLIER_CAT(String(e.category ?? ''))) cogs += amt; else opex += amt }
  const externalCosts = (extQ.data ?? []).reduce((s, r) => s + Number(r.cost_cents ?? 0), 0) / 100

  const r2 = (n: number) => Math.round(n * 100) / 100
  const grossProfit = revenue - cogs
  const netProfit = grossProfit - labour - opex - externalCosts
  const pnl = {
    period: { from, to },
    revenue: r2(revenue), cogs: r2(cogs), gross_profit: r2(grossProfit),
    gross_margin_pct: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : null,
    labour: r2(labour), operating_expenses: r2(opex), external_ai_costs: r2(externalCosts),
    net_profit: r2(netProfit),
    net_margin_pct: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : null,
    labour_pct: revenue > 0 ? Math.round((labour / revenue) * 1000) / 10 : null,
  }

  return NextResponse.json({
    empty: false,
    pnl,
    cash_forecast: (forecastQ.data ?? [])[0] ?? null,
    reconciliations: reconQ.data ?? [],
    anomalies: anomQ.data ?? [],
  })
}

export const GET = withErrorCapture('finance/overview', _GET)
