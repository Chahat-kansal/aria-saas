export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'
import { generateChallengesForMember, evaluateChallenges } from '@/lib/loyalty/challenges'

// LOY-CHALLENGES — customer-facing GET (own missions only; lazy-generates grounded challenges + evaluates
// progress) and owner-facing POST (config: enable + reward points). Customer side is READ-ONLY: progress is
// only ever advanced by real server-side sales (the pos/sale hook). Identity-scoped — a customer can only
// see their OWN business membership's challenges.

async function readConfig(businessId: string): Promise<{ enabled: boolean; reward: number }> {
  const { data } = await supabaseAdmin.from('pos_loyalty_config')
    .select('challenges_enabled, challenge_reward_points').eq('business_id', businessId).maybeSingle()
  return { enabled: !!data?.challenges_enabled, reward: Number(data?.challenge_reward_points ?? 50) || 50 }
}

// ── CUSTOMER: GET /api/loyalty/challenges?business_id=… ──
async function _GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('business_id') ?? ''
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const membership = await getLoyaltyMembership(businessId)
  if (!membership) return NextResponse.json({ enabled: false, challenges: [] })

  const { enabled, reward } = await readConfig(businessId)
  if (!enabled) return NextResponse.json({ enabled: false, challenges: [] })

  // Lazy generation: only if they have no active challenges (bounded — no cron needed). Then evaluate
  // progress from real sales (also completes/awards anything already met since their last visit).
  await generateChallengesForMember(membership.customer_id, businessId, membership.identity_id, reward)
  await evaluateChallenges(membership.customer_id, businessId)

  const { data } = await supabaseAdmin.from('loyalty_challenges')
    .select('id, title, description, target_metric, target_item, target_count, progress, reward_points, status, expires_at, completed_at')
    .eq('customer_id', membership.customer_id).eq('business_id', businessId)
    .in('status', ['active', 'completed', 'claimed'])
    .order('status', { ascending: true }).order('created_at', { ascending: false }).limit(12)

  return NextResponse.json({ enabled: true, challenges: data ?? [] })
}

// ── OWNER config: POST /api/loyalty/challenges  { enabled, reward_points } ──
async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { enabled?: boolean; reward_points?: number }
  const enabled = !!body.enabled
  const reward = Math.max(10, Math.min(500, Math.round(Number(body.reward_points) || 50)))

  const { data: existing } = await supabaseAdmin.from('pos_loyalty_config').select('business_id').eq('business_id', bid).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('pos_loyalty_config').update({ challenges_enabled: enabled, challenge_reward_points: reward }).eq('business_id', bid)
  } else {
    await supabaseAdmin.from('pos_loyalty_config').insert({ business_id: bid, challenges_enabled: enabled, challenge_reward_points: reward })
  }
  return NextResponse.json({ ok: true, enabled, reward_points: reward })
}

async function _GET_owner(req: Request) {
  // Owner reads current config (used by the dashboard ChallengesSection).
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const bid = await getBid(supabase, user.id)
    if (bid && new URL(req.url).searchParams.get('owner') === '1') {
      const cfg = await readConfig(bid)
      return NextResponse.json({ enabled: cfg.enabled, reward_points: cfg.reward })
    }
  }
  return _GET(req)
}

export const GET = withErrorCapture('loyalty/challenges:get', _GET_owner)
export const POST = withErrorCapture('loyalty/challenges:post', _POST)
