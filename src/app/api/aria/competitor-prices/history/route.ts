export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const business_id = searchParams.get('business_id')
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    const { data: biz } = await supabase.from('businesses').select('id')
      .eq('id', business_id).eq('user_id', user.id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabase.from('competitor_price_cache')
      .select('id,product_name,competitor_name,competitor_price_cents,confidence,searched_at')
      .eq('business_id', business_id)
      .order('searched_at', { ascending: false })
      .limit(50)

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ entries: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ entries: data ?? [] })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const GET = withErrorCapture('aria/competitor-prices/history', _GET)
