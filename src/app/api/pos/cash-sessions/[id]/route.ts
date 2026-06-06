export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computeExpectedCashCents, computeVarianceCents, classifyVariance } from '@/lib/pos/cash-session-engine'

type Params = { params: { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request, { params }: Params) {
  const { id } = params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: session, error } = await supabase.from('pos_cash_sessions').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
  if (error?.code === '42P01') return NextResponse.json({ session: null, sales: [] })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: sales } = await supabase.from('pos_sales')
    .select('id, sale_number, total_amount, payment_method, status, created_at')
    .eq('business_id', bid)
    .eq('session_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ session, sales: sales ?? [] })
}

async function _PATCH(req: Request, { params }: Params) {
  const { id } = params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: session, error: sessErr } = await supabase.from('pos_cash_sessions').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
  if (sessErr?.code === '42P01') return NextResponse.json({ error: 'Cash sessions table not created' }, { status: 503 })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status !== 'open') return NextResponse.json({ error: 'Session is already closed' }, { status: 400 })

  const body = await req.json()
  const actual_cash_cents = Math.round(Number(body.actual_cash_cents) || 0)
  const closure_note = String(body.closure_note ?? '').slice(0, 500)
  const closed_by = String(body.closed_by_name ?? user.id).slice(0, 200)

  // Compute totals from sales in this session
  const { data: sessionSales } = await supabase.from('pos_sales')
    .select('total_amount, payment_method, status')
    .eq('business_id', bid).eq('session_id', id).neq('status', 'voided')

  const total_cash_sales = (sessionSales ?? []).filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  const total_card_sales = (sessionSales ?? []).filter(s => s.payment_method !== 'cash').reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)

  const { data: sessionReturns } = await supabase.from('pos_sale_returns')
    .select('refund_amount, original_sale_id')
    .in('original_sale_id', (sessionSales ?? []).map(s => s).map((_, i) => i).slice(0, 0))
  const total_refunds = (sessionReturns ?? []).reduce((sum, r) => sum + (Number(r.refund_amount) || 0), 0)

  const expected_cash_cents = computeExpectedCashCents(Number(session.opening_float) || 0, total_cash_sales, total_refunds)
  const variance_cents = computeVarianceCents(expected_cash_cents, actual_cash_cents)
  const classification = classifyVariance(variance_cents, total_cash_sales)

  const { error: updateErr } = await supabase.from('pos_cash_sessions').update({
    status: 'closed',
    closed_at: new Date().toISOString(),
    closed_by,
    closing_float: actual_cash_cents / 100,
    total_cash_sales: +total_cash_sales.toFixed(2),
    total_card_sales: +total_card_sales.toFixed(2),
    total_refunds: +total_refunds.toFixed(2),
    expected_cash_cents,
    actual_cash_cents,
    variance_cents,
    closure_note,
  }).eq('id', id).eq('business_id', bid)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  if (classification === 'significant_short' || classification === 'significant_over') {
    try {
      const { ariaObserve } = await import('@/lib/aria/brain')
      await ariaObserve({
        business_id: bid,
        category: 'cashflow',
        event_type: 'cash_variance',
        data: { session_id: id, variance_cents, classification, total_cash_sales },
        triggered_by: user.id,
      })
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return NextResponse.json({ ok: true, variance_cents, classification, expected_cash_cents })
}

export const GET = withErrorCapture('pos/cash-sessions/[id]', _GET)
export const PATCH = withErrorCapture('pos/cash-sessions/[id]', _PATCH)
