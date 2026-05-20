export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getDailySpend } from '@/lib/aria/cost-guard'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const spend = await getDailySpend(bid)
  return NextResponse.json({
    today: spend,
    percent_used: spend.limit_cents > 0 ? Math.round((spend.spent_cents / spend.limit_cents) * 100) : 0,
  })
}
