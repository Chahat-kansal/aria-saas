export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, loyalty_points_per_dollar, loyalty_redeem_rate, loyalty_minimum_redeem')
    .eq('user_id', user.id).eq('is_active', true).maybeSingle()

  return NextResponse.json({
    enabled: true,
    points_per_dollar: biz?.loyalty_points_per_dollar ?? 1,
    redeem_rate: biz?.loyalty_redeem_rate ?? 0.01, // $0.01 per point
    minimum_redeem: biz?.loyalty_minimum_redeem ?? 100, // minimum 100 points
  })
}

export const GET = withErrorCapture('pos/loyalty/config', _GET)
