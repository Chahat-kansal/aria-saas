export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ★ DAILY SCHEDULE (0 3 * * *) = 3am UTC = 1pm Melbourne
// Vercel Hobby plan — DO NOT change to sub-daily schedule

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  return NextResponse.json({ ok: true, synced, failed, total: posts.length })
}
