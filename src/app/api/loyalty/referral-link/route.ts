export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyIdentity, getLoyaltyMembership } from '@/lib/loyalty/auth'
import { getOrCreateReferralCode, captureReferral } from '@/lib/loyalty/referrals'

// LOY-REFERRALS — customer-facing: the signed-in member's own invite code/link + their own referral
// list (identity+business scoped — a member only ever sees their OWN referrals). POST captures a pending
// referral for the signed-in NEW member (covers both the join and set-PIN signup paths; idempotent).

interface RefRow { status: string; referral_date: string; referrer_points_awarded: number | null; referred_points_awarded: number | null }

async function readConfig(businessId: string): Promise<{ enabled: boolean; referrer: number; referee: number }> {
  const { data } = await supabaseAdmin.from('pos_loyalty_config')
    .select('referrals_enabled, referral_bonus_points, referee_bonus_points').eq('business_id', businessId).maybeSingle()
  return { enabled: !!data?.referrals_enabled, referrer: Number(data?.referral_bonus_points ?? 100), referee: Number(data?.referee_bonus_points ?? 50) }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const bidParam = url.searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ enabled: false, code: null, referrals: [] })

  const cfg = await readConfig(realId)
  const membership = await getLoyaltyMembership(realId)
  if (!cfg.enabled || !membership) return NextResponse.json({ enabled: cfg.enabled, code: null, referrals: [], referrer_bonus: cfg.referrer, referee_bonus: cfg.referee })

  const code = await getOrCreateReferralCode(membership.customer_id, membership.name)
  const origin = url.origin
  const share_url = code ? `${origin}/loyalty/${realId}/signin?ref=${encodeURIComponent(code)}` : null

  const { data: rows } = await supabaseAdmin.from('loyalty_referrals')
    .select('status, referral_date, referrer_points_awarded, referred_points_awarded')
    .eq('referrer_customer_id', membership.customer_id).eq('business_id', realId)
    .order('referral_date', { ascending: false }).limit(50)

  const referrals = ((rows ?? []) as RefRow[]).map(r => ({
    status: r.status, date: r.referral_date, points: Number(r.referrer_points_awarded ?? 0),
  }))
  const rewarded = referrals.filter(r => r.status === 'rewarded').length

  return NextResponse.json({
    enabled: true, code, share_url, referrer_bonus: cfg.referrer, referee_bonus: cfg.referee,
    summary: { total: referrals.length, rewarded, pending: referrals.length - rewarded },
    referrals,
  })
}

// POST { business_id, ref } → capture a pending referral for the signed-in new member (idempotent).
export async function POST(req: Request) {
  const identity = await getLoyaltyIdentity()
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { business_id?: string; ref?: string }
  const realId = body.business_id ? await resolveBusinessId(supabaseAdmin, String(body.business_id)) : null
  if (!realId || typeof body.ref !== 'string' || !body.ref.trim()) return NextResponse.json({ ok: false })

  const membership = await getLoyaltyMembership(realId)
  if (!membership) return NextResponse.json({ ok: false })

  const result = await captureReferral(realId, body.ref, {
    customer_id: membership.customer_id, identity_id: identity.id, email: identity.email, phone: identity.phone,
  })
  return NextResponse.json(result)
}
