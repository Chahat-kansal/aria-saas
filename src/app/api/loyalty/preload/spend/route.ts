export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { spendPreload } from '@/lib/loyalty/preload'

// LOY-PRELOAD — apply stored value as a checkout tender. Called by the POS terminal. Owner/staff session
// scoped to their own business; the customer must belong to that business. The spend is atomic and is
// rejected (never goes negative) on insufficient balance.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { customer_id?: string; amount?: number; sale_id?: string }
  const amount = Number(body.amount)
  if (!body.customer_id || !(amount > 0)) return NextResponse.json({ error: 'customer_id and positive amount required' }, { status: 400 })

  // The customer must belong to this owner's business (no cross-business spend).
  const { data: cust } = await supabaseAdmin.from('pos_customers').select('id').eq('id', body.customer_id).eq('business_id', bid).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found for this business' }, { status: 404 })

  try {
    const newBalance = await spendPreload(bid, body.customer_id, amount, body.sale_id ?? null)
    return NextResponse.json({ ok: true, balance: newBalance })
  } catch (e) {
    // Insufficient balance / no account → reject; balance is unchanged (the RPC is atomic).
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export const POST = withErrorCapture('loyalty/preload/spend', _POST)
