export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getBiz(supabase: any, userId: string) {
  const { data } = await supabase.from('businesses')
    .select('id').eq('user_id', userId).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (code) {
    const { data, error } = await supabase
      .from('pos_gift_cards')
      .select('id,code,balance,initial_balance,recipient_name,issued_at,expires_at,is_active')
      .eq('business_id', biz.id)
      .eq('code', code.toUpperCase().trim())
      .maybeSingle()
    if (error?.code === '42P01') return NextResponse.json({ gift_card: null })
    if (!data) return NextResponse.json({ error: 'Gift card not found' }, { status: 404 })
    if (!data.is_active) return NextResponse.json({ error: 'Gift card inactive' }, { status: 400 })
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Gift card expired' }, { status: 400 })
    }
    return NextResponse.json({ gift_card: data })
  }

  const { data, error } = await supabase
    .from('pos_gift_cards')
    .select('id,code,balance,initial_balance,recipient_name,issued_at,expires_at,is_active,created_at')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })
  if (error?.code === '42P01') return NextResponse.json({ gift_cards: [] })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gift_cards: data || [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json()
  const amount = parseFloat(body.amount || body.balance || '0')
  const code = (body.code || generateCode()).toUpperCase().trim()

  const { data, error } = await supabase.from('pos_gift_cards').insert({
    business_id: biz.id,
    code,
    balance: amount,
    initial_balance: amount,
    recipient_name: body.recipient_name || null,
    expires_at: body.expires_at || null,
    is_active: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  void (async () => { try { await supabase.from('pos_gift_card_transactions').insert({ gift_card_id: data.id, business_id: biz.id, type: 'issue', amount, balance_after: amount, note: body.recipient_name ? `Issued to ${body.recipient_name}` : 'Issued' }) } catch {} })()
  return NextResponse.json({ gift_card: data })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.reload_amount !== undefined) {
    const reload = parseFloat(String(body.reload_amount))
    if (isNaN(reload) || reload <= 0) return NextResponse.json({ error: 'Invalid reload amount' }, { status: 400 })
    const { data: card } = await supabase.from('pos_gift_cards')
      .select('balance').eq('id', id).eq('business_id', biz.id).maybeSingle()
    if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const newBalance = (Number(card.balance) || 0) + reload
    const { data, error } = await supabase.from('pos_gift_cards')
      .update({ balance: newBalance, is_active: true }).eq('id', id).eq('business_id', biz.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    void (async () => { try { await supabase.from('pos_gift_card_transactions').insert({ gift_card_id: id, business_id: biz.id, type: 'reload', amount: reload, balance_after: newBalance, note: body.note || null }) } catch {} })()
    return NextResponse.json({ gift_card: data })
  }

  if (body.deduct !== undefined) {
    const { data: card } = await supabase.from('pos_gift_cards')
      .select('balance').eq('id', id).eq('business_id', biz.id).maybeSingle()
    if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    updates.balance = Math.max(0, card.balance - parseFloat(body.deduct))
  }
  if (body.balance !== undefined) updates.balance = parseFloat(body.balance)
  if (body.is_active !== undefined) updates.is_active = body.is_active

  const { data, error } = await supabase.from('pos_gift_cards')
    .update(updates).eq('id', id).eq('business_id', biz.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gift_card: data })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('pos_gift_cards')
    .delete().eq('id', id).eq('business_id', biz.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/gift-cards', _GET)
export const POST = withErrorCapture('pos/gift-cards', _POST)
export const PATCH = withErrorCapture('pos/gift-cards', _PATCH)
export const DELETE = withErrorCapture('pos/gift-cards', _DELETE)
