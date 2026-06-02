export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const biz = await supabaseAdmin.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let items: Array<{ id: string; post_type: string; likes_count: number; comments_count: number; saves_count: number; created_at: string; content: string }> = []
  try {
    const { data: posts } = await supabaseAdmin
      .from('community_posts')
      .select('id, post_type, likes_count, comments_count, saves_count, created_at, content')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(50)
    items = (posts ?? []) as Array<{ id: string; post_type: string; likes_count: number; comments_count: number; saves_count: number; created_at: string; content: string }>
  } catch {
    return NextResponse.json({ by_type: [], top_posts: [], total_engagement: 0, post_count: 0 })
  }

  const byType: Record<string, { total: number; count: number }> = {}
  for (const p of items) {
    const t = p.post_type ?? 'text'
    if (!byType[t]) byType[t] = { total: 0, count: 0 }
    byType[t].total += (p.likes_count ?? 0) + (p.comments_count ?? 0) + (p.saves_count ?? 0)
    byType[t].count++
  }

  const by_type = Object.entries(byType).map(([type, v]) => ({
    type,
    avg_engagement: v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : 0,
    count: v.count,
  })).sort((a, b) => b.avg_engagement - a.avg_engagement)

  const top_posts = [...items].sort((a, b) => {
    const engA = (a.likes_count ?? 0) + (a.comments_count ?? 0) + (a.saves_count ?? 0)
    const engB = (b.likes_count ?? 0) + (b.comments_count ?? 0) + (b.saves_count ?? 0)
    return engB - engA
  }).slice(0, 5).map(p => ({
    id: p.id,
    caption: (p.content ?? '').slice(0, 80),
    engagement: (p.likes_count ?? 0) + (p.comments_count ?? 0) + (p.saves_count ?? 0),
    likes_count: p.likes_count ?? 0,
    comments_count: p.comments_count ?? 0,
    created_at: p.created_at,
  }))

  const total_engagement = items.reduce((s, p) => s + (p.likes_count ?? 0) + (p.comments_count ?? 0) + (p.saves_count ?? 0), 0)

  return NextResponse.json({ by_type, top_posts, total_engagement, post_count: items.length })
}

export const GET = withErrorCapture('social/community-analytics', _GET)
