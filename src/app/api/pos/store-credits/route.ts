export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const customer_id = searchParams.get('customer_id')

  if (code) {
    const { data } = await supabase.from('pos_store_credits')
      .select('*').eq('business_id', bid).eq('code', code.toUpperCase()).eq('is_active', true).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Store credit not found or inactive' }, { status: 404 })
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Store credit has expired' }, { status: 400 })
    }
    return NextResponse.json({ credit: data })
  }

  let q = supabase.from('pos_store_credits').select('*').eq('business_id', bid).eq('is_active', true).order('created_at', { ascending: false }).limit(200)
  if (customer_id) q = q.eq('customer_id', customer_id)
  const { data } = await q
  return NextResponse.json({ credits: data ?? [] })
}

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { code, amount, sale_id } = await req.json().catch(() => ({}))
  if (!code || !amount || amount <= 0) return NextResponse.json({ error: 'code and amount required' }, { status: 400 })

  const { data: credit } = await supabase.from('pos_store_credits')
    .select('*').eq('business_id', bid).eq('code', String(code).toUpperCase()).eq('is_active', true).maybeSingle()
  if (!credit) return NextResponse.json({ error: 'Store credit not found' }, { status: 404 })
  if (credit.expires_at && new Date(credit.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Store credit has expired' }, { status: 400 })
  }

  // WIRE-5 — IDEMPOTENT: if this sale already redeemed this credit, return the prior result
  // (a retried POST must NOT double-spend). Dollars throughout (pos_store_credits is DOLLARS).
  if (sale_id) {
    const { data: prior } = await supabase.from('pos_store_credit_txns')
      .select('balance_after').eq('credit_id', credit.id).eq('sale_id', sale_id).eq('type', 'redeem').maybeSingle()
    if (prior) return NextResponse.json({ ok: true, balance_after: Number(prior.balance_after), credit_id: credit.id, idempotent: true })
  }

  const currentBalance = Number(credit.balance) || 0
  if (currentBalance < amount) {
    return NextResponse.json({ error: `Insufficient balance. Available: A$${currentBalance.toFixed(2)}` }, { status: 400 })
  }
  const newBalance = Math.round((currentBalance - amount) * 100) / 100

  // ATOMIC guard against double-spend: only update if the balance is still what we read
  // (optimistic lock). A concurrent redeem changes the balance → 0 rows → 409, no double-spend.
  const { data: updated } = await supabase.from('pos_store_credits').update({
    balance: newBalance,
    is_active: newBalance > 0,
    redeemed_at: newBalance === 0 ? new Date().toISOString() : null,
  }).eq('id', credit.id).eq('balance', currentBalance).select('id').maybeSingle()
  if (!updated) return NextResponse.json({ error: 'Balance changed during redemption — please retry' }, { status: 409 })

  await supabase.from('pos_store_credit_txns').insert({
    business_id: bid,
    credit_id: credit.id,
    sale_id: sale_id ?? null,
    amount: -amount,
    type: 'redeem',
    balance_after: newBalance,
    note: sale_id ? `Redeemed on sale ${String(sale_id).slice(-6).toUpperCase()}` : 'Redeemed at register',
  })

  return NextResponse.json({ ok: true, balance_after: newBalance, credit_id: credit.id })
}

export const GET = withBusinessContext('pos/store-credits', _GET)
export const POST = withBusinessContext('pos/store-credits', _POST)
