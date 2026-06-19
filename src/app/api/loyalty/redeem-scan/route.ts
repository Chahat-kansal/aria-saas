export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { decryptCustomerPII } from '@/lib/aria/customer-pii'
import { createHash } from 'crypto'

// LOY-REDEEM-SCAN (cashier side) — resolve a scanned customer redeem code, then atomically
// consume it (single-use). Auth: cashier/owner via getBid (like sibling POS routes). The token is
// validated against THIS business only (cross-business tokens never resolve). This route does NOT
// mutate points/ledger — after `consume` returns the customer_id, the cashier UI calls the existing
// /api/pos/loyalty/redeem to write the ledger row (one redeem implementation, reused).

// Local getBid — mirrors the sibling POS routes (active business → oldest active fallback).
async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { token?: string; action?: string }
  const token = (body.token ?? '').toString().trim()
  const action = body.action === 'consume' ? 'consume' : 'resolve'
  if (!token) return NextResponse.json({ error: 'No code scanned.' }, { status: 400 })

  // A raw customer_id (or any non-token) simply won't hash to a stored redeem_token_hash → not found.
  const hash = createHash('sha256').update(token).digest('hex')
  const nowIso = new Date().toISOString()

  if (action === 'consume') {
    // Atomic single-use: succeeds only if currently UNCONSUMED and UNEXPIRED, scoped to this business.
    const { data: consumed } = await supabaseAdmin.from('pos_customer_auth')
      .update({ redeem_token_consumed_at: nowIso })
      .eq('redeem_token_hash', hash).eq('business_id', bid)
      .is('redeem_token_consumed_at', null).gt('redeem_token_expires_at', nowIso)
      .select('customer_id').maybeSingle()
    if (!consumed?.customer_id) {
      return NextResponse.json({ error: 'This code has already been used or has expired.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, customer_id: consumed.customer_id })
  }

  // resolve (preview) — do NOT consume; just identify + show balance for cashier confirmation.
  const { data: row } = await supabaseAdmin.from('pos_customer_auth')
    .select('customer_id, redeem_token_expires_at, redeem_token_consumed_at')
    .eq('redeem_token_hash', hash).eq('business_id', bid).maybeSingle()
  if (!row?.customer_id) return NextResponse.json({ error: 'Invalid code — ask the customer to refresh their code.' }, { status: 404 })
  if (row.redeem_token_consumed_at) return NextResponse.json({ error: 'This code has already been used.' }, { status: 400 })
  if (!row.redeem_token_expires_at || new Date(row.redeem_token_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This code has expired — ask the customer to refresh it.' }, { status: 400 })
  }

  const [{ data: cust }, { data: cfg }] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id, name, name_enc, points_balance, stamps_count').eq('id', row.customer_id as string).eq('business_id', bid).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_config').select('program_type, point_value_cents, stamp_reward_text, stamps_to_reward').eq('business_id', bid).maybeSingle(),
  ])
  if (!cust) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })

  let name = (cust.name as string | null) ?? null
  try { name = decryptCustomerPII(cust as Record<string, unknown>, bid).name ?? name } catch { /* keep plaintext */ }

  const programType = (cfg?.program_type ?? 'points') === 'stamps' ? 'stamps' : 'points'
  const balance = Number(cust.points_balance ?? 0)
  const pointValueCents = Number(cfg?.point_value_cents ?? 1)
  const stamps = Number(cust.stamps_count ?? 0)
  const stampsTarget = Math.max(1, Number(cfg?.stamps_to_reward ?? 10))

  return NextResponse.json({
    ok: true,
    customer_id: cust.id,
    name,
    program_type: programType,
    points_balance: balance,
    point_value_cents: pointValueCents,
    dollar_value: Math.round(balance * pointValueCents) / 100,
    stamps_count: stamps,
    stamps_target: stampsTarget,
    stamp_reward_text: (cfg?.stamp_reward_text as string) ?? 'a free reward',
    stamp_reward_ready: stamps >= stampsTarget,
  })
}

export const POST = withErrorCapture('loyalty/redeem-scan', _POST)
