export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ customers: [] })

  const { data } = await supabase
    .from('pos_customers')
    .select('id, name, email, phone, balance, loyalty_points, total_spent, last_visit')
    .eq('business_id', bid)
    .gt('balance', 0)
    .order('balance', { ascending: false })
    .limit(100)
  return NextResponse.json({ customers: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { customer_id, amount, type, note } = await req.json()
  if (!customer_id || !amount || !type) return NextResponse.json({ error: 'customer_id, amount, type required' }, { status: 400 })

  const { data: customer } = await supabase.from('pos_customers').select('balance').eq('id', customer_id).eq('business_id', bid).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const delta = type === 'credit' ? Math.abs(amount) : -Math.abs(amount)
  const newBalance = (customer.balance ?? 0) + delta
  await supabase.from('pos_customers').update({ balance: newBalance }).eq('id', customer_id)
  return NextResponse.json({ ok: true, new_balance: newBalance })
}

export const GET = withErrorCapture('pos/balances', _GET)
export const POST = withErrorCapture('pos/balances', _POST)
