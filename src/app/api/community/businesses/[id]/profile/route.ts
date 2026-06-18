export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ id: string }> }

// Public — extended Facebook/LinkedIn-style business profile:
// cover, info, follower + post counts, "verified local business" badge,
// recent posts (Phase 2 published content).
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const [bizRes, followCountRes, postCountRes, recentPostsRes, b2bFollowingRes, b2bFollowersRes, highlightsRes] = await Promise.all([
      supabaseAdmin.from('businesses')
        .select('id, name, industry, city, suburb, logo_url, website, community_verified, community_bio, community_cover_url, google_rating, phone, address, email')
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

    return NextResponse.json({
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
