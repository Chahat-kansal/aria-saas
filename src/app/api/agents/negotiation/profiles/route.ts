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

  const { data: profiles, error } = await supabaseAdmin
    .from('supplier_negotiation_profiles')
    .select('*')
    .eq('business_id', biz.id)
    .order('leverage_score', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const totalOpportunity = (profiles ?? []).reduce((s, p) => s + Number(p.total_spend_12m ?? 0) * (Number(p.price_creep_pct ?? 0) / 100), 0)
  const strongest = (profiles ?? []).sort((a, b) => Number(b.leverage_score) - Number(a.leverage_score))[0]

  return NextResponse.json({
    profiles: profiles ?? [],
    summary: {
      total_suppliers: (profiles ?? []).length,
      total_opportunity_annual: Math.round(totalOpportunity * 100) / 100,
      strongest_position: strongest ? { supplier_name: strongest.supplier_name, leverage_score: strongest.leverage_score } : null,
      urgent_count: (profiles ?? []).filter(p => p.negotiation_priority === 'urgent').length,
      high_count: (profiles ?? []).filter(p => p.negotiation_priority === 'high').length,
    },
  })
}

export const GET = withErrorCapture('agents/negotiation/profiles', _GET)
