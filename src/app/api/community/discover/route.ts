export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'

// Public — Discover: businesses the visitor doesn't follow yet, ranked by
// recent activity. If the member already follows some businesses, prioritise
// suggestions from the SAME suburb + industry (the network compounds).
export async function GET() {
  try {
    const member = await getCommunityMember()

    // Step 1: resolve already-followed business ids (so we exclude them)
    let followedIds: string[] = []
    let pinnedSuburbs: string[] = []
    let pinnedIndustries: string[] = []
    if (member) {
      const { data: follows } = await supabaseAdmin.from('community_follows')
        .select('business_id, businesses(suburb, city, industry)')
        .eq('member_id', member.id).is('unfollowed_at', null)
      type FollowRow = { business_id: string; businesses: { suburb: string | null; city: string | null; industry: string | null } | null }
      const list = (follows ?? []) as unknown as FollowRow[]
      followedIds = list.map(r => r.business_id)
      pinnedSuburbs = Array.from(new Set(list.map(r => r.businesses?.suburb ?? r.businesses?.city).filter((s): s is string => !!s)))
      pinnedIndustries = Array.from(new Set(list.map(r => r.businesses?.industry).filter((s): s is string => !!s)))
    }

    // Step 2: pull recent-active businesses (>=1 published post in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
    const { data: activeBids } = await supabaseAdmin.from('community_posts')
      .select('business_id')
      .eq('status', 'published')
      .gte('published_at', thirtyDaysAgo)
      .limit(500)
    const activeIdSet = new Set(((activeBids ?? []) as Array<{ business_id: string }>).map(r => r.business_id))

    // Step 3: load business directory excluding follows
    let q = supabaseAdmin.from('businesses')
      .select('id, name, industry, suburb, city, logo_url, community_verified, community_bio')
      .neq('onboarding_complete', false)
      .limit(60)
    if (followedIds.length > 0) q = q.not('id', 'in', '(' + followedIds.join(',') + ')')

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type BizRow = { id: string; name: string | null; industry: string | null; suburb: string | null; city: string | null; logo_url: string | null; community_verified: boolean | null; community_bio: string | null }
    const candidates = (rows ?? []) as BizRow[]

    // Step 4: score — recent activity + match on follower's suburb/industry + verified
    const scored = candidates.map(b => {
      let score = 0
      if (activeIdSet.has(b.id)) score += 30
      if (b.community_verified) score += 5
      const loc = b.suburb ?? b.city
      if (loc && pinnedSuburbs.includes(loc)) score += 25
      if (b.industry && pinnedIndustries.includes(b.industry)) score += 15
      return { ...b, score }
    }).sort((a, b) => b.score - a.score)

    // Step 5: split into two strips — "Recommended for you" + "All near you"
    // For brand-new members (no follows), use the same scored list as the only strip.
    const recommended = scored.filter(b => b.score > 0).slice(0, 12)
    const nearbyAll = scored.slice(0, 24)

    // Build top-3 follower-count badge ("⭐ 124 followers") for ranking + social proof
    const ids = nearbyAll.map(b => b.id)
    let followerCount: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: fc } = await supabaseAdmin.from('community_follows')
        .select('business_id')
        .in('business_id', ids)
        .is('unfollowed_at', null)
      for (const row of ((fc ?? []) as Array<{ business_id: string }>)) {
        followerCount[row.business_id] = (followerCount[row.business_id] ?? 0) + 1
      }
    }
    // CX-0: POS-signal enrichment — which businesses are active right now (busy/promo), data-driven.
    const busyMap: Record<string, number> = {}
    const promoMap: Record<string, boolean> = {}
    if (ids.length > 0) {
      const nowIso = new Date().toISOString()
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: salesRows } = await supabaseAdmin.from('pos_sales')
        .select('business_id').in('business_id', ids).eq('status', 'completed').gte('created_at', twoHoursAgo)
      for (const s of (salesRows ?? []) as { business_id: string }[]) busyMap[s.business_id] = (busyMap[s.business_id] ?? 0) + 1
      const { data: promoRows } = await supabaseAdmin.from('pos_promotions')
        .select('business_id').in('business_id', ids).eq('is_active', true)
        .or(`valid_from.is.null,valid_from.lte.${nowIso}`).or(`valid_until.is.null,valid_until.gte.${nowIso}`)
      for (const pr of (promoRows ?? []) as { business_id: string }[]) promoMap[pr.business_id] = true
    }

    const decorate = (b: BizRow & { score: number }) => ({
      id: b.id, name: b.name, industry: b.industry, suburb: b.suburb, city: b.city,
      logo_url: b.logo_url, community_verified: b.community_verified, community_bio: b.community_bio,
      followers: followerCount[b.id] ?? 0,
      busy_now: busyMap[b.id] ?? 0,
      promo_live: !!promoMap[b.id],
    })

    return NextResponse.json({
      recommended: recommended.map(decorate),
      nearby: nearbyAll.map(decorate),
      has_follows: followedIds.length > 0,
    })
  } catch (err) {
    console.error('[community/discover]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
