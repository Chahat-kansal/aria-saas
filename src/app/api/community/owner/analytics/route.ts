export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// CX-OWNER-TRUST-1 — community analytics for the owner dashboard. One call returns everything the
// dashboard renders. Every figure is a real DB count scoped to the owner's business — nothing invented.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

const DAY = 86_400_000

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const now = Date.now()
  const d7 = new Date(now - 7 * DAY).toISOString()
  const d14 = new Date(now - 14 * DAY).toISOString()
  const d30 = new Date(now - 30 * DAY).toISOString()

  // ── Followers (active follows only) ──────────────────────────────────────
  const [followAll, follow7, follow14, followRowsRes, engRes] = await Promise.all([
    supabaseAdmin.from('community_follows').select('id', { count: 'exact', head: true }).eq('business_id', bid).is('unfollowed_at', null),
    supabaseAdmin.from('community_follows').select('id', { count: 'exact', head: true }).eq('business_id', bid).is('unfollowed_at', null).gte('followed_at', d7),
    supabaseAdmin.from('community_follows').select('id', { count: 'exact', head: true }).eq('business_id', bid).is('unfollowed_at', null).gte('followed_at', d14).lt('followed_at', d7),
    supabaseAdmin.from('community_follows').select('followed_at').eq('business_id', bid).gte('followed_at', d14),
    // Engagement scoped to this business via the post join. !inner + the joined-column filter keeps it to bid.
    supabaseAdmin.from('community_post_engagement')
      .select('engagement_type, created_at, post_id, community_posts!inner(business_id)')
      .eq('community_posts.business_id', bid)
      .gte('created_at', d30),
  ])

  const followers_total = followAll.count ?? 0
  const followers_this_week = follow7.count ?? 0
  const followers_last_week = follow14.count ?? 0

  // Follower growth — 14 daily buckets (new follows per day), oldest → newest.
  const growthMap: Record<string, number> = {}
  for (const r of (followRowsRes.data ?? []) as Array<{ followed_at: string }>) {
    if (!r.followed_at) continue
    const day = new Date(r.followed_at).toISOString().slice(0, 10)
    growthMap[day] = (growthMap[day] ?? 0) + 1
  }
  const follower_growth: Array<{ date: string; count: number }> = []
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now - i * DAY).toISOString().slice(0, 10)
    follower_growth.push({ date: day, count: growthMap[day] ?? 0 })
  }

  // ── Engagement aggregation (last 30 days) ────────────────────────────────
  const eng = (engRes.data ?? []) as Array<{ engagement_type: string; created_at: string; post_id: string }>
  let reach_total = 0, reach_this_week = 0, total_likes = 0, total_comments = 0, total_shares = 0
  const perPost: Record<string, { views: number; likes: number; comments: number; shares: number }> = {}
  const slotMap: Record<string, number> = {} // "day-hour" → count (AEST)

  for (const e of eng) {
    const t = e.engagement_type
    if (t === 'view') { reach_total++; if (e.created_at >= d7) reach_this_week++ }
    else if (t === 'like') total_likes++
    else if (t === 'comment') total_comments++
    else if (t === 'share') total_shares++

    const p = perPost[e.post_id] ?? { views: 0, likes: 0, comments: 0, shares: 0 }
    if (t === 'view') p.views++
    else if (t === 'like') p.likes++
    else if (t === 'comment') p.comments++
    else if (t === 'share') p.shares++
    perPost[e.post_id] = p

    // AEST (UTC+10) day-of-week × hour for the best-times grid.
    const aest = new Date(new Date(e.created_at).getTime() + 10 * 3_600_000)
    slotMap[`${aest.getUTCDay()}-${aest.getUTCHours()}`] = (slotMap[`${aest.getUTCDay()}-${aest.getUTCHours()}`] ?? 0) + 1
  }

  const engagement_rate = Math.round(((total_likes + total_comments + total_shares) / Math.max(reach_total, 1)) * 1000) / 10
  const best_times = Object.entries(slotMap).map(([k, count]) => {
    const [day, hour] = k.split('-').map(Number)
    return { day, hour, count }
  })

  // ── Top posts (by views + likes + comments, last 30d) ────────────────────
  const ranked = Object.entries(perPost)
    .map(([post_id, s]) => ({ post_id, score: s.views + s.likes + s.comments, ...s }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  let top_posts: Array<{ id: string; title: string | null; post_type: string; media_urls: string[]; published_at: string | null; views: number; likes: number; comments: number; shares: number }> = []
  if (ranked.length > 0) {
    const { data: postRows } = await supabaseAdmin.from('community_posts')
      .select('id, title, post_type, media_urls, published_at, status')
      .in('id', ranked.map(r => r.post_id))
      .eq('status', 'published')
    const pmap = new Map((postRows ?? []).map((p: Record<string, unknown>) => [p.id as string, p]))
    top_posts = ranked
      .filter(r => pmap.has(r.post_id))
      .map(r => {
        const p = pmap.get(r.post_id) as Record<string, unknown>
        return {
          id: r.post_id,
          title: (p.title as string) ?? null,
          post_type: (p.post_type as string) ?? 'update',
          media_urls: Array.isArray(p.media_urls) ? (p.media_urls as string[]) : [],
          published_at: (p.published_at as string) ?? null,
          views: r.views, likes: r.likes, comments: r.comments, shares: r.shares,
        }
      })
  }

  return NextResponse.json({
    followers_total, followers_this_week, followers_last_week, follower_growth,
    reach_total, reach_this_week, total_likes, total_comments, total_shares, engagement_rate,
    top_posts, best_times,
  })
}

export const GET = withErrorCapture('community/owner/analytics', _GET)
