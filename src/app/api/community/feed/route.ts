export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import { generateColdStartCards, type BizSignal } from '@/lib/community/cold-start-cards'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Public — returns cursor-paginated community feed with geo-scoping + POS-live badges.
// Query params:
//   cursor | before  — ISO timestamp for cursor pagination (newest first)
//   lat, lng         — haversine geo filter (3km radius)
//   suburb           — suburb name filter (alternative to lat/lng)
//   limit            — max results (5–50, default 20)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(50, Math.max(5, parseInt(searchParams.get('limit') ?? '20')))
    const before = searchParams.get('cursor') ?? searchParams.get('before')
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    const suburbParam = searchParams.get('suburb')

    const member = await getCommunityMember()

    // Determine followed businesses + hidden set
    let businessIds: string[] | null = null
    let memberFollowMap: Record<string, { is_hidden: boolean }> = {}
    if (member) {
      const { data: follows } = await supabaseAdmin
        .from('community_follows')
        .select('business_id, is_hidden')
        .eq('member_id', member.id)
        .is('unfollowed_at', null)
      const list = (follows ?? []) as Array<{ business_id: string; is_hidden: boolean }>
      memberFollowMap = Object.fromEntries(list.map(f => [f.business_id, { is_hidden: f.is_hidden }]))
      businessIds = list.filter(f => !f.is_hidden).map(f => f.business_id)
    }

    // CX-POLISH-2 — "Following" tab: restrict to followed (non-hidden) businesses only.
    const followingOnly = searchParams.get('following_only') === 'true'
    if (followingOnly && (!member || !businessIds || businessIds.length === 0)) {
      // No member / no follows → empty feed (graceful, not an error).
      return NextResponse.json({
        posts: [],
        next_cursor: null,
        mode: 'followed',
        member: member ? { id: member.id, nickname: member.nickname } : null,
      })
    }

    // ── Geo-scope: resolve which business IDs are in range ───────────────────
    let geoBusinessIds: string[] | null = null

    if (latParam && lngParam) {
      const lat = parseFloat(latParam)
      const lng = parseFloat(lngParam)
      if (!isNaN(lat) && !isNaN(lng)) {
        // Bounding box ~0.05° ≈ 5km, then haversine for precision
        const { data: bizsInBox } = await supabaseAdmin
          .from('businesses')
          .select('id, lat, lng')
          .eq('is_active', true)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .gte('lat', lat - 0.05)
          .lte('lat', lat + 0.05)
          .gte('lng', lng - 0.07)
          .lte('lng', lng + 0.07)
        geoBusinessIds = ((bizsInBox ?? []) as { id: string; lat: number; lng: number }[])
          .filter(b => haversineKm(lat, lng, b.lat, b.lng) <= 3)
          .map(b => b.id)
      }
    } else {
      // Suburb filter: explicit param > member's own business suburb > no filter
      let targetSuburb = suburbParam
      if (!targetSuburb && member?.user_id) {
        const { data: memberBiz } = await supabaseAdmin
          .from('businesses')
          .select('suburb')
          .eq('user_id', member.user_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
        targetSuburb = memberBiz?.suburb ?? null
      }
      if (targetSuburb) {
        const { data: suburbBizs } = await supabaseAdmin
          .from('businesses')
          .select('id')
          .eq('is_active', true)
          .eq('suburb', targetSuburb)
        geoBusinessIds = ((suburbBizs ?? []) as { id: string }[]).map(b => b.id)
      }
    }

    // ── Posts query ──────────────────────────────────────────────────────────
    let q = supabaseAdmin
      .from('community_posts')
      .select('id, business_id, post_type, title, body, media_urls, media_type, ai_generated, published_at, location_tag, businesses(name, logo_url, industry, suburb, city, community_verified)')
      .eq('status', 'published')
      .eq('is_story', false)
      .order('published_at', { ascending: false })
      .limit(limit + 1)

    if (before) q = q.lt('published_at', before)

    // Apply geo filter when resolved
    if (geoBusinessIds !== null) {
      if (geoBusinessIds.length === 0) {
        // No businesses in range — return empty feed
        return NextResponse.json({
          posts: [],
          next_cursor: null,
          mode: 'discovery',
          member: member ? { id: member.id, nickname: member.nickname } : null,
        })
      }
      q = q.in('business_id', geoBusinessIds)
    }

    // CX-POLISH-2 — Following tab: filter to the member's followed businesses (intersects with geo if set).
    if (followingOnly && businessIds && businessIds.length > 0) {
      q = q.in('business_id', businessIds)
    }

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type PostRow = {
      id: string; business_id: string; post_type: string; title: string | null; body: string | null
      media_urls: string[]; media_type: string | null; ai_generated: boolean | null; published_at: string
      location_tag: string | null
      businesses: { name: string | null; logo_url: string | null; industry: string | null; suburb: string | null; city: string | null; community_verified: boolean | null } | null
    }
    const list = (rows ?? []) as unknown as PostRow[]
    const hasMore = list.length > limit
    const slice = hasMore ? list.slice(0, limit) : list

    // ── Engagement counts ────────────────────────────────────────────────────
    const postIds = slice.map(p => p.id)
    let counts: Record<string, { like: number; comment: number; save: number }> = {}
    let mineMap: Record<string, { liked: boolean; saved: boolean }> = {}
    if (postIds.length > 0) {
      const { data: engs } = await supabaseAdmin
        .from('community_post_engagement')
        .select('post_id, engagement_type, member_id')
        .in('post_id', postIds)
        .in('engagement_type', ['like', 'comment', 'save'])
      type Eng = { post_id: string; engagement_type: string; member_id: string | null }
      for (const e of (engs ?? []) as Eng[]) {
        if (!e.post_id) continue
        counts[e.post_id] = counts[e.post_id] ?? { like: 0, comment: 0, save: 0 }
        if (e.engagement_type === 'like' || e.engagement_type === 'comment' || e.engagement_type === 'save') {
          counts[e.post_id][e.engagement_type]++
        }
        if (member && e.member_id === member.id) {
          mineMap[e.post_id] = mineMap[e.post_id] ?? { liked: false, saved: false }
          if (e.engagement_type === 'like') mineMap[e.post_id].liked = true
          if (e.engagement_type === 'save') mineMap[e.post_id].saved = true
        }
      }
    }

    // ── POS-signal chips: busy_now (2h sales) + fresh_batch (post) + fresh_product (24h) + promo_live ──
    const bizIds = [...new Set(slice.map(p => p.business_id))]
    const busyMap: Record<string, number> = {}
    const freshMap: Record<string, boolean> = {}
    const freshProductMap: Record<string, string> = {}  // product name added in last 24h
    const promoMap: Record<string, string> = {}         // active promotion name
    const nowIso = new Date().toISOString()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    if (bizIds.length > 0) {
      // BUSY-NOW: count completed sales in the last 2h (chip shows at >= 3)
      const { data: salesRows } = await supabaseAdmin
        .from('pos_sales').select('business_id')
        .in('business_id', bizIds).eq('status', 'completed').gte('created_at', twoHoursAgo)
      for (const s of (salesRows ?? []) as { business_id: string }[]) {
        busyMap[s.business_id] = (busyMap[s.business_id] ?? 0) + 1
      }

      // fresh_batch: community post with type 'fresh_batch' that hasn't expired
      const { data: freshRows } = await supabaseAdmin
        .from('community_posts').select('business_id')
        .in('business_id', bizIds).eq('post_type', 'fresh_batch').eq('status', 'published').gt('expires_at', nowIso)
      for (const f of (freshRows ?? []) as { business_id: string }[]) freshMap[f.business_id] = true

      // FRESH-BATCH (POS): a product added in the last 24h
      const { data: prodRows } = await supabaseAdmin
        .from('pos_products').select('business_id, name, created_at')
        .in('business_id', bizIds).eq('is_active', true).gte('created_at', dayAgo)
        .order('created_at', { ascending: false })
      for (const p of (prodRows ?? []) as { business_id: string; name: string | null }[]) {
        if (!freshProductMap[p.business_id] && p.name) freshProductMap[p.business_id] = p.name
      }

      // PROMO-LIVE: an active promotion currently inside its valid window
      const { data: promoRows } = await supabaseAdmin
        .from('pos_promotions').select('business_id, name, valid_from, valid_until')
        .in('business_id', bizIds).eq('is_active', true)
        .or(`valid_from.is.null,valid_from.lte.${nowIso}`)
        .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
      for (const pr of (promoRows ?? []) as { business_id: string; name: string | null }[]) {
        if (!promoMap[pr.business_id] && pr.name) promoMap[pr.business_id] = pr.name
      }
    }

    // ── Story ring: unseen stories per business for this member ─────────────
    const storyRingMap: Record<string, 'unseen' | 'seen' | 'none'> = {}
    if (bizIds.length > 0) {
      // Active stories per business
      const { data: activeStories } = await supabaseAdmin
        .from('community_posts')
        .select('id, business_id')
        .in('business_id', bizIds)
        .eq('status', 'published')
        .eq('is_story', true)
        .gt('expires_at', nowIso)
      const storyIdsByBiz: Record<string, string[]> = {}
      for (const s of (activeStories ?? []) as { id: string; business_id: string }[]) {
        if (!storyIdsByBiz[s.business_id]) storyIdsByBiz[s.business_id] = []
        storyIdsByBiz[s.business_id].push(s.id)
      }

      // Which of those has the member seen?
      const allStoryIds = Object.values(storyIdsByBiz).flat()
      const seenStoryIds = new Set<string>()
      if (allStoryIds.length > 0 && member) {
        const { data: seenEngs } = await supabaseAdmin
          .from('community_post_engagement')
          .select('post_id')
          .in('post_id', allStoryIds)
          .eq('member_id', member.id)
          .eq('engagement_type', 'story_view')
        for (const e of (seenEngs ?? []) as { post_id: string | null }[]) {
          if (e.post_id) seenStoryIds.add(e.post_id)
        }
      }

      for (const [bid, ids] of Object.entries(storyIdsByBiz)) {
        if (ids.length === 0) { storyRingMap[bid] = 'none'; continue }
        const anyUnseen = ids.some(id => !seenStoryIds.has(id))
        storyRingMap[bid] = anyUnseen ? 'unseen' : 'seen'
      }
    }

    // ── Stream IDs for live posts ─────────────────────────────────────────────
    const livePostIds = slice.filter(p => p.post_type === 'live').map(p => p.id)
    const liveStreamMap: Record<string, string> = {}
    if (livePostIds.length > 0) {
      const { data: liveStreams } = await supabaseAdmin
        .from('community_live_streams')
        .select('id, community_post_id')
        .in('community_post_id', livePostIds)
        .eq('status', 'active')
      for (const s of (liveStreams ?? []) as { id: string; community_post_id: string }[]) {
        if (s.community_post_id) liveStreamMap[s.community_post_id] = s.id
      }
    }

    // ── Assemble posts ────────────────────────────────────────────────────────
    const posts = slice.map(p => ({
      id: p.id,
      business_id: p.business_id,
      business: p.businesses,
      post_type: p.post_type,
      title: p.title,
      body: p.body,
      media_urls: Array.isArray(p.media_urls) ? p.media_urls : [],
      media_type: p.media_type,
      ai_generated: p.ai_generated ?? false,
      published_at: p.published_at,
      location_tag: p.location_tag ?? null,
      counts: counts[p.id] ?? { like: 0, comment: 0, save: 0 },
      mine: mineMap[p.id] ?? { liked: false, saved: false },
      followed: !!(businessIds && businessIds.includes(p.business_id)),
      stream_id: liveStreamMap[p.id] ?? null,
      busy_now: busyMap[p.business_id] ?? 0,
      fresh_batch: freshMap[p.business_id] ?? false,
      fresh_product: !!freshProductMap[p.business_id],
      promo_live: !!promoMap[p.business_id],
      story_ring: storyRingMap[p.business_id] ?? 'none',
    }))

    // Sort: live → followed → followed+story → recency
    posts.sort((a, b) => {
      const aLive = a.post_type === 'live', bLive = b.post_type === 'live'
      if (aLive && !bLive) return -1
      if (!aLive && bLive) return 1
      if (a.followed && !b.followed) return -1
      if (!a.followed && b.followed) return 1
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    })

    const mode = (businessIds && businessIds.length > 0) ? 'followed' : 'discovery'

    // CX-0 cold-start: in a SPARSE discovery feed, inject AI insight cards built from the REAL POS
    // signals of the businesses already in view (busy/promo/fresh). No signal → no card (no filler).
    let feedItems: unknown[] = posts
    if (mode === 'discovery' && posts.length < 10 && bizIds.length > 0) {
      const nameByBiz: Record<string, string | null> = {}
      const logoByBiz: Record<string, string | null> = {}
      for (const p of slice) { nameByBiz[p.business_id] = p.businesses?.name ?? null; logoByBiz[p.business_id] = p.businesses?.logo_url ?? null }
      const signals: BizSignal[] = bizIds.map(bid => ({
        business_id: bid,
        name: nameByBiz[bid] ?? 'A local business',
        busy_2h: busyMap[bid] ?? 0,
        promo_name: promoMap[bid] ?? null,
        fresh_product_name: freshProductMap[bid] ?? null,
        logo_url: logoByBiz[bid] ?? null,
      }))
      const cards = await generateColdStartCards(signals)
      if (cards.length > 0) {
        const merged: unknown[] = [...posts]
        let insertAt = 3
        for (const card of cards) {
          if (insertAt > merged.length) merged.push(card)
          else merged.splice(insertAt, 0, card)
          insertAt += 3
        }
        feedItems = merged
      }
    }

    return NextResponse.json({
      posts: feedItems,
      next_cursor: hasMore ? slice[slice.length - 1].published_at : null,
      mode,
      member: member ? { id: member.id, nickname: member.nickname } : null,
    })
  } catch (err) {
    console.error('[community/feed]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
