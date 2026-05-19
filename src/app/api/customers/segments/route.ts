export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Use DB segment column — populated by customer-scoring cron
  const { data: rows, count } = await supabaseAdmin
    .from('pos_customers')
    .select('segment', { count: 'exact', head: false })
    .eq('business_id', business_id)

  const segCounts: Record<string, number> = {}
  for (const r of rows ?? []) {
    const s = (r as Record<string, unknown>).segment as string || 'unscored'
    segCounts[s] = (segCounts[s] ?? 0) + 1
  }

  return NextResponse.json({ total: count ?? 0, ...segCounts })
}

export const GET = withErrorCapture('customers/segments', _GET)
