export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { createClient } from '@supabase/supabase-js'
import { decryptFieldSafe } from '@/lib/encryption'

// ★ DAILY SCHEDULE (0 3 * * *) = 3am UTC = 1pm Melbourne
// Vercel Hobby plan — DO NOT change to sub-daily schedule

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  const syncedBefore = new Date()
  syncedBefore.setHours(syncedBefore.getHours() - 12)

  // Find published posts from last 30 days that haven't been synced in 12h
  const { data: posts } = await supabase
    .from('social_posts')
    .select('id, platform, platform_post_id, business_id, engagement_data')
    .eq('status', 'published')
    .gte('published_at', cutoff.toISOString())
    .in('platform', ['instagram', 'facebook'])
    .limit(50)

  if (!posts || posts.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 })
  }

  // Get connections for access tokens — batch by business
  const businessIds = [...new Set(posts.map(p => p.business_id))]
  const { data: connections } = await supabase
    .from('social_connections')
    .select('business_id, platform, access_token, instagram_account_id, platform_page_id')
    .in('business_id', businessIds)
    .eq('is_active', true)

  const connMap = new Map<string, typeof connections>()
  for (const c of connections ?? []) {
    const key = `${c.business_id}:${c.platform}`
    // SECURITY-RESIDUE-FIX-1 PART 4 — dual-read: decrypts newly-encrypted tokens, passes still-
    // plaintext ones through unchanged (decryptFieldSafe), so this cron keeps working through the
    // Meta token-encryption migration with no separate code path.
    c.access_token = decryptFieldSafe(c.access_token, c.business_id)
    connMap.set(key, c as any)
  }

  let synced = 0
  let failed = 0

  for (const post of posts) {
    if (!post.platform_post_id) continue

    const conn = connMap.get(`${post.business_id}:${post.platform}`)
    if (!conn) continue

    try {
      let metrics: Record<string, number> = {}

      if (post.platform === 'instagram') {
        const igId = (conn as any).instagram_account_id
        if (!igId) continue
        const res = await fetch(
          `https://graph.facebook.com/v25.0/${post.platform_post_id}/insights?metric=likes,comments,shares,reach,impressions&access_token=${(conn as any).access_token}`
        )
        if (res.ok) {
          const d = await res.json()
          for (const item of d.data ?? []) {
            metrics[item.name] = item.values?.[0]?.value ?? 0
          }
        }
      } else if (post.platform === 'facebook') {
        const res = await fetch(
          `https://graph.facebook.com/v25.0/${post.platform_post_id}/insights?metric=post_engaged_users,post_impressions,post_reactions_by_type_total&access_token=${(conn as any).access_token}`
        )
        if (res.ok) {
          const d = await res.json()
          for (const item of d.data ?? []) {
            metrics[item.name] = item.values?.[0]?.value ?? 0
          }
        }
      }

      if (Object.keys(metrics).length > 0) {
        await supabase
          .from('social_posts')
          .update({ engagement_data: { ...metrics, fetched_at: new Date().toISOString() } })
          .eq('id', post.id)
        synced++
      }
    } catch {
      failed++
    }
  }

  // Gap 8: Update hashtag performance stats
  const publishedWithHashtags = await supabase
    .from('social_posts')
    .select('id, business_id, hashtags, engagement_data')
    .eq('status', 'published')
    .not('hashtags', 'eq', '{}')
    .gte('published_at', cutoff.toISOString())
    .limit(100)

  for (const post of publishedWithHashtags.data ?? []) {
    if (!post.hashtags?.length || !post.engagement_data) continue
    const reach = (post.engagement_data as any).reach ?? (post.engagement_data as any).post_impressions ?? 0
    const likes = (post.engagement_data as any).likes ?? (post.engagement_data as any).post_engaged_users ?? 0
    if (!reach) continue

    for (const tag of post.hashtags as string[]) {
      const cleanTag = tag.replace(/^#+/, '')
      await supabase.from('social_hashtag_stats').upsert({
        business_id: post.business_id,
        hashtag: cleanTag,
        avg_reach: reach,
        avg_likes: likes,
        usage_count: 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id,hashtag' })
      try {
        await supabase.rpc('increment_hashtag_usage', {
          p_business_id: post.business_id,
          p_hashtag: cleanTag,
          p_reach: reach,
          p_likes: likes,
        })
      } catch (e) { console.warn('[non-fatal]', e) }
    }
  }

  // Gap 12: Mark expired stories
  await supabase.from('social_posts')
    .update({ status: 'expired' as any })
    .eq('post_type', 'story')
    .lt('story_expires_at', new Date().toISOString())
    .not('status', 'eq', 'expired')
    .then(() => {})

  return NextResponse.json({ ok: true, synced, failed, total: posts.length })
}
