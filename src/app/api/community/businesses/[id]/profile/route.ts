export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import { resolveMemberCustomerLink } from '@/lib/community/loyalty-link'
import { getLifetimePoints } from '@/lib/community/points'
import { pointsToLevel, getLevelThresholds } from '@/lib/community/levels'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type Params = { params: Promise<{ id: string }> }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9-]+$/

// Public — extended Facebook/LinkedIn-style business profile:
// cover, info, follower + post counts, "verified local business" badge,
// recent posts (Phase 2 published content).
//
// CX-CLARITY-1 — the [id] segment now accepts EITHER a real business uuid OR businesses.slug,
// resolved via the same resolveBusinessId() every CX/booking/public route already uses — the
// established "accept id or slug" convention in this codebase, not a new one. Every internal query
// below uses the RESOLVED real uuid, never the raw path param, so a slug can never leak into a
// column that expects a real FK.
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id: idOrSlug } = await params
    if (!idOrSlug) return NextResponse.json({ error: 'id required' }, { status: 400 })
    // CX-CLARITY-1 — fail fast on an obviously-malformed slug before spending a query on it.
    if (!UUID_RE.test(idOrSlug) && !SLUG_RE.test(idOrSlug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const id = await resolveBusinessId(supabaseAdmin, idOrSlug)
    if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [bizRes, followCountRes, postCountRes, recentPostsRes, b2bFollowingRes, b2bFollowersRes, highlightsRes] = await Promise.all([
      supabaseAdmin.from('businesses')
        .select('id, slug, name, industry, city, suburb, logo_url, website, community_verified, community_bio, community_cover_url, google_rating, phone, address, email')
        .eq('id', id).maybeSingle(),
      supabaseAdmin.from('community_follows')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', id).is('unfollowed_at', null),
      supabaseAdmin.from('community_posts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', id).eq('status', 'published'),
      supabaseAdmin.from('community_posts')
        .select('id, post_type, title, body, media_urls, media_type, published_at, is_story, expires_at')
        .eq('business_id', id).eq('status', 'published').eq('is_story', false)
        .order('published_at', { ascending: false }).limit(20),
      supabaseAdmin.from('community_business_follows')
        .select('following_business_id, businesses!community_business_follows_following_business_id_fkey(name, logo_url)')
        .eq('follower_business_id', id).limit(20),
      supabaseAdmin.from('community_business_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_business_id', id),
      // CX-OWNER-TRUST-2: owner-curated story highlights for the public profile.
      supabaseAdmin.from('community_story_highlights')
        .select('id, title, cover_url, post_ids, display_order')
        .eq('business_id', id).order('display_order', { ascending: true }).order('created_at', { ascending: true }),
    ])

    if (!bizRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // CX-GAME-LEAN — "your status at this shop": level + progress + real lifetime points, shown only
    // when the viewer's community identity resolves to a loyalty customer of THIS business (via the
    // opportunistic link — see loyalty-link.ts). Viewing this page with both a community session and
    // a valid cx_session for this business is itself the linking moment. No link → null, never a
    // fabricated L1 for a non-member.
    let yourStatus: {
      level: number; name: string; nextAt: number | null; progress: number; lifetimePoints: number
      unlockedPerkPoints: number | null; upcomingLevelName: string | null; upcomingPerkPoints: number | null
    } | null = null
    let bannerDismissed = false
    const member = await getCommunityMember()
    if (member) {
      const link = await resolveMemberCustomerLink(member.id, id).catch(() => null)
      if (link) {
        const [lifetimePoints, thresholds] = await Promise.all([
          getLifetimePoints(link.customerId),
          getLevelThresholds(supabaseAdmin, id),
        ])
        const level = pointsToLevel(lifetimePoints, thresholds)

        // CX-GAME-2 — real awards only: the most recent level-up's perk (if one was actually issued,
        // reward_rule_id set + issue_error null), and the next level's perk as a teaser (config only —
        // never implies it's already been earned).
        const { data: latestAward } = await supabaseAdmin.from('community_level_awards')
          .select('level, reward_rule_id, issue_error').eq('business_id', id).eq('loyalty_identity_id', link.loyaltyIdentityId)
          .order('level', { ascending: false }).limit(1).maybeSingle()
        let unlockedPerkPoints: number | null = null
        if (latestAward?.reward_rule_id && !latestAward.issue_error) {
          const { data: rule } = await supabaseAdmin.from('loyalty_reward_rules').select('points_value').eq('id', latestAward.reward_rule_id).maybeSingle()
          unlockedPerkPoints = rule?.points_value != null ? Number(rule.points_value) : null
        }

        let upcomingLevelName: string | null = null
        let upcomingPerkPoints: number | null = null
        const nextThreshold = thresholds.find(t => t.min === level.nextAt)
        if (nextThreshold?.perkRewardRuleId) {
          const { data: rule } = await supabaseAdmin.from('loyalty_reward_rules').select('points_value').eq('id', nextThreshold.perkRewardRuleId).maybeSingle()
          if (rule?.points_value != null) { upcomingLevelName = nextThreshold.name; upcomingPerkPoints = Number(rule.points_value) }
        }

        yourStatus = { ...level, lifetimePoints, unlockedPerkPoints, upcomingLevelName, upcomingPerkPoints }
        bannerDismissed = link.bannerDismissed
      }
    }

    return NextResponse.json({
      your_status: yourStatus,
      banner_dismissed: bannerDismissed,
      business: bizRes.data,
      stats: {
        followers: followCountRes.count ?? 0,
        post_count: postCountRes.count ?? 0,
        b2b_followers: b2bFollowersRes.count ?? 0,
        rating: (bizRes.data as { google_rating?: number | null }).google_rating ?? null,
      },
      recent_posts: recentPostsRes.data ?? [],
      highlights: highlightsRes.data ?? [],
      b2b_following: ((b2bFollowingRes.data ?? []) as unknown as Array<{ following_business_id: string; businesses: { name: string | null; logo_url: string | null } | null }>).map((r) => ({
        id: r.following_business_id,
        name: r.businesses?.name,
        logo_url: r.businesses?.logo_url,
      })),
    })
  } catch (err) {
    console.error('[community/businesses profile]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
