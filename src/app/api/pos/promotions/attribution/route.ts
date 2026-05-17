export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ rows: [] })
  const { data: redemptions } = await supabase.from('pos_promotion_redemptions')
    .select('promotion_id, promotion_name, amount_off, sale_id, pos_sales(total_amount)')
    .eq('business_id', bid)
  const map = new Map<string, { promotion_id: string; promotion_name: string; total_redemptions: number; total_amount_off: number; total_sales_amount: number }>()
  for (const r of redemptions ?? []) {
    const k = r.promotion_id
    const existing = map.get(k) ?? { promotion_id: k, promotion_name: r.promotion_name, total_redemptions: 0, total_amount_off: 0, total_sales_amount: 0 }
    existing.total_redemptions++
    existing.total_amount_off += Number(r.amount_off) || 0
    const sale = Array.isArray(r.pos_sales) ? r.pos_sales[0] : r.pos_sales
    existing.total_sales_amount += Number((sale as { total_amount?: number } | null)?.total_amount) || 0
    map.set(k, existing)
  }
  return NextResponse.json({ rows: Array.from(map.values()).sort((a, b) => b.total_redemptions - a.total_redemptions) })
}

export const GET = withErrorCapture('pos/promotions/attribution', _GET)
