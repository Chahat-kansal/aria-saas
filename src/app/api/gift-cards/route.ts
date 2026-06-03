export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function generateCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let part = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) part += '-'
    part += chars[Math.floor(Math.random() * chars.length)]
  }
  return (prefix || 'GC') + '-' + part
}

async function getBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
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
  const search = searchParams.get('search') ?? ''
  const statusFilter = searchParams.get('status') ?? 'all'

  let query = supabaseAdmin
    .from('pos_gift_cards')
    .select('id,code,balance,initial_balance,redeemed_amount,recipient_name,issued_at,expires_at,is_active,created_at,last_used_at,voided_at,void_reason')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })

  if (search) query = query.ilike('code', '%' + search + '%')
  if (statusFilter === 'active') query = query.eq('is_active', true)
  if (statusFilter === 'inactive') query = query.eq('is_active', false)

  const { data: cards, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const active = (cards ?? []).filter(c => c.is_active && !(c.expires_at && new Date(c.expires_at) < now))
  const totalLiability = active.reduce((s, c) => s + (Number(c.balance) || 0), 0)
  const issuedThisMonth = (cards ?? []).filter(c => c.created_at >= monthStart).length

  const { data: txns } = await supabaseAdmin
    .from('gift_card_transactions')
    .select('amount')
    .eq('business_id', biz.id)
    .eq('type', 'redeem')
    .gte('created_at', monthStart)

  const redeemedThisMonth = (txns ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0)

  return NextResponse.json({
    gift_cards: cards ?? [],
    stats: {
      active_count: active.length,
      total_liability: totalLiability,
      redeemed_this_month: redeemedThisMonth,
      issued_this_month: issuedThisMonth,
    },
  })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json()
  const amount = parseFloat(String(body.amount || body.balance || '0'))
  if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

  const { data: settings } = await supabaseAdmin
    .from('gift_card_settings').select('prefix,expiry_months,min_load,max_load')
    .eq('business_id', biz.id).maybeSingle()

  const prefix = settings?.prefix ?? 'GC'
  const minLoad = Number(settings?.min_load ?? 10)
  const maxLoad = Number(settings?.max_load ?? 500)
  if (amount < minLoad) return NextResponse.json({ error: 'Amount below minimum (' + minLoad + ')' }, { status: 400 })
  if (amount > maxLoad) return NextResponse.json({ error: 'Amount above maximum (' + maxLoad + ')' }, { status: 400 })

  const expiryMonths = Number(settings?.expiry_months ?? 36)
  let expiresAt: string | null = body.expires_at ?? null
  if (!expiresAt && expiryMonths > 0) {
    const d = new Date()
    d.setMonth(d.getMonth() + expiryMonths)
    expiresAt = d.toISOString()
  }

  const code = body.code ? String(body.code).toUpperCase().trim() : generateCode(prefix)
  const staffName: string | null = body.staff_name ?? null

  const { data: card, error: insertErr } = await supabaseAdmin.from('pos_gift_cards').insert({
    business_id: biz.id,
    code,
    balance: amount,
    initial_balance: amount,
    redeemed_amount: 0,
    recipient_name: body.recipient_name ?? null,
    expires_at: expiresAt,
    is_active: true,
    issued_at: new Date().toISOString(),
  }).select().single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  await supabaseAdmin.from('gift_card_transactions').insert({
    business_id: biz.id,
    gift_card_id: card.id,
    type: 'issue',
    amount,
    balance_after: amount,
    staff_name: staffName,
    note: body.recipient_name ? 'Issued to ' + body.recipient_name : (body.note ?? null),
  })

  return NextResponse.json({ gift_card: card })
}

export const GET = withErrorCapture('gift-cards', _GET)
export const POST = withErrorCapture('gift-cards', _POST)
