export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const { customer_id } = body as { customer_id?: string }
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  // WIRE-1 — loyalty earn (balance + ledger, config-aware, idempotent) is now handled atomically
  // by the sale route for ALL sale paths (terminal + mobile). This endpoint previously ALSO bumped
  // the balance, double-awarding points alongside the sale route's increment_loyalty_points. It no
  // longer mutates anything — kept for backward compatibility with the terminal's fire-and-forget
  // call. Returns the current balance.
  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('loyalty_points, points_balance')
    .eq('id', customer_id)
    .eq('business_id', bid)
    .maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  return NextResponse.json({ ok: true, total_points: Number(cust.loyalty_points ?? cust.points_balance ?? 0) })
}

export const POST = withErrorCapture('loyalty/earn', _POST)
