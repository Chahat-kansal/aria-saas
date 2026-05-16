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
  if (!bid) return NextResponse.json({ transfers: [] })

  // Try pos_stock_transfers first
  const { data, error: e } = await supabase.from('pos_stock_transfers')
    .select('*, pos_products(name), pos_outlets!from_outlet_id(name), pos_outlets!to_outlet_id(name)')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(100)

  if (e) return NextResponse.json({ transfers: [], note: 'No transfer history yet' })
  return NextResponse.json({ transfers: data ?? [] })
}

export const GET = withErrorCapture('pos/transfer-reports', _GET)