export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// ONBOARD-FIX-1 (feature-set confirmation) — which nav_* industry-preference
// flags THIS business has turned off. Deliberately separate from the
// plan-tier BusinessProvider.hasFlag() (a static client-side map for
// paywall/upsell badges) — this is a real per-business read, since owner
// preference can't be approximated from the plan alone.
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  let businessId = active?.business_id as string | undefined
  if (!businessId) {
    const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    businessId = biz?.id
  }
  if (!businessId) return NextResponse.json({ disabled: [] })

  const { data: flags } = await supabaseAdmin.from('feature_flags')
    .select('flag_key, disabled_for_business_ids')
    .like('flag_key', 'nav_%')

  const disabled = (flags ?? [])
    .filter(f => ((f.disabled_for_business_ids as string[] | null) ?? []).includes(businessId as string))
    .map(f => f.flag_key as string)

  return NextResponse.json({ disabled })
}

export const GET = withErrorCapture('features/disabled', _GET)
