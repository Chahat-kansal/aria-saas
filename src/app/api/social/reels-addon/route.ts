import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
export const dynamic = 'force-dynamic'

/**
 * GET  /api/social/reels-addon?business_id= — check if reels enabled for this business
 * POST /api/social/reels-addon              — owner explicitly opts in (records acceptance)
 *
 * Reels cost ~$0.35–0.70 per video via Google Veo API. This addon is opt-in only.
 * Acceptance is logged with timestamp + email for billing/audit purposes.
 * UPGRADE_ONLY: never remove this gate, only add more checks.
 */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ enabled: false })
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ enabled: false })
  const { data } = await supabase.from('social_preferences')
    .select('reels_enabled,reels_addon_accepted_at')
    .eq('business_id', businessId).maybeSingle()
  return NextResponse.json({
    enabled: data?.reels_enabled ?? false,
    accepted_at: data?.reels_addon_accepted_at ?? null,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { business_id, enable } = await req.json()
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Verify ownership
  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date().toISOString()
  const { data: existing } = await supabase.from('social_preferences')
    .select('id').eq('business_id', business_id).maybeSingle()

  if (existing) {
    await supabase.from('social_preferences').update({
      reels_enabled: enable !== false,
      reels_addon_accepted_at: enable !== false ? now : null,
      reels_addon_accepted_by: enable !== false ? user.email : null,
    }).eq('business_id', business_id)
  } else {
    await supabase.from('social_preferences').insert({
      business_id,
      reels_enabled: true,
      reels_addon_accepted_at: now,
      reels_addon_accepted_by: user.email,
    })
  }

  return NextResponse.json({ ok: true, enabled: enable !== false })
}
