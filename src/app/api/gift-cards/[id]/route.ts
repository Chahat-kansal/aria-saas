export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// GET /api/gift-cards/[id] — public balance check, no auth required
// id can be a UUID or a card code
async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id.toUpperCase().trim()

  const isUuid = /^[0-9a-f-]{36}$/i.test(id)
  let query = supabaseAdmin
    .from('pos_gift_cards')
    .select('id,code,balance,initial_balance,redeemed_amount,recipient_name,issued_at,expires_at,is_active,last_used_at')

  if (isUuid) {
    query = query.eq('id', id)
  } else {
    query = query.eq('code', id)
  }

  const { data: card, error } = await query.maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!card) return NextResponse.json({ error: 'Gift card not found' }, { status: 404 })

  const expired = card.expires_at && new Date(card.expires_at) < new Date()
  return NextResponse.json({
    gift_card: {
      ...card,
      status: !card.is_active ? 'voided' : expired ? 'expired' : (Number(card.balance) <= 0 ? 'depleted' : 'active'),
    },
  })
}

// PATCH /api/gift-cards/[id] — redeem | topup | void | flag (requires auth)
async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = params.id

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('user_id', user.id).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json()
  const action: string = body.action

  const { data: card, error: fetchErr } = await supabaseAdmin
    .from('pos_gift_cards')
    .select('id,code,balance,initial_balance,redeemed_amount,is_active,expires_at')
    .eq('id', id).eq('business_id', biz.id).maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const currentBalance = Number(card.balance ?? 0)
  const staffName: string | null = body.staff_name ?? null

  if (action === 'redeem') {
    const amount = parseFloat(String(body.amount))
    if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    if (!card.is_active) return NextResponse.json({ error: 'Card is not active' }, { status: 400 })
    if (card.expires_at && new Date(card.expires_at) < new Date()) return NextResponse.json({ error: 'Card expired' }, { status: 400 })
    const charge = Math.min(amount, currentBalance)
    const newBalance = Math.max(0, currentBalance - charge)
    const newRedeemed = (Number(card.redeemed_amount) || 0) + charge

    const { data: updated, error: upErr } = await supabaseAdmin.from('pos_gift_cards')
      .update({ balance: newBalance, redeemed_amount: newRedeemed, is_active: newBalance > 0, last_used_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    await supabaseAdmin.from('gift_card_transactions').insert({
      business_id: biz.id, gift_card_id: id, type: 'redeem',
      amount: charge, balance_after: newBalance,
      sale_id: body.sale_id ?? null, staff_name: staffName, note: body.note ?? null,
    })
    return NextResponse.json({ gift_card: updated, charged: charge, remaining: newBalance })
  }

  if (action === 'topup') {
    const amount = parseFloat(String(body.amount))
    if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    const newBalance = currentBalance + amount

    const { data: updated, error: upErr } = await supabaseAdmin.from('pos_gift_cards')
      .update({ balance: newBalance, is_active: true })
      .eq('id', id).select().single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    await supabaseAdmin.from('gift_card_transactions').insert({
      business_id: biz.id, gift_card_id: id, type: 'topup',
      amount, balance_after: newBalance, staff_name: staffName, note: body.note ?? null,
    })
    return NextResponse.json({ gift_card: updated })
  }

  if (action === 'void') {
    const { data: updated, error: upErr } = await supabaseAdmin.from('pos_gift_cards')
      .update({ is_active: false, voided_at: new Date().toISOString(), void_reason: body.reason ?? null })
      .eq('id', id).select().single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    await supabaseAdmin.from('gift_card_transactions').insert({
      business_id: biz.id, gift_card_id: id, type: 'void',
      amount: currentBalance, balance_after: 0, staff_name: staffName, note: body.reason ?? null,
    })
    return NextResponse.json({ gift_card: updated })
  }

  if (action === 'flag') {
    const { data: updated, error: upErr } = await supabaseAdmin.from('pos_gift_cards')
      .update({ is_flagged: true, flag_reason: body.reason ?? 'Manually flagged' })
      .eq('id', id).select().single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    return NextResponse.json({ gift_card: updated })
  }

  return NextResponse.json({ error: 'Unknown action. Use: redeem | topup | void | flag' }, { status: 400 })
}

export const GET = withErrorCapture('gift-cards/[id]', _GET)
export const PATCH = withErrorCapture('gift-cards/[id]', _PATCH)
