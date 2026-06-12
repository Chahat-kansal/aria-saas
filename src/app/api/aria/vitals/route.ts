export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { todayAEST, toAESTStart } from '@/lib/date-au'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!biz) return NextResponse.json({ revenue_today: null, tx_count_today: null })

    // TZ-1: AEST midnight, not server/UTC midnight
    const todayStartIso = toAESTStart(todayAEST())

    const { data: sales } = await supabase
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', biz.id)
      .neq('status', 'voided')
      .gte('created_at', todayStartIso)

    const revenue_today = (sales ?? []).reduce((s, r) => s + Number(r.total_amount || 0), 0)
    const tx_count_today = (sales ?? []).length

    return NextResponse.json({ revenue_today, tx_count_today })
  } catch {
    return NextResponse.json({ revenue_today: null, tx_count_today: null })
  }
}
