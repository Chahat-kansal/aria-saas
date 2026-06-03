export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const { data: reconciliations, error } = await supabaseAdmin
    .from('daily_reconciliations')
    .select('*')
    .eq('business_id', biz.id)
    .gte('recon_date', d30)
    .order('recon_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = reconciliations ?? []
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const last7 = rows.filter(r => String(r.recon_date) >= d7)
  const total_variance_7d = last7.reduce((s, r) => s + Math.abs(Number(r.variance_amount ?? 0)), 0)
  const unresolved_count = rows.filter(r => r.status === 'variance').length

  return NextResponse.json({ reconciliations: rows, total_variance_7d, unresolved_count })
}

export const GET = withErrorCapture('agents/reconciliation/daily', _GET)
