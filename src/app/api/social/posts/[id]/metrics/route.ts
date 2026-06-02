export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { impressions, likes, comments, shares, saves } = body as {
    impressions?: number; likes?: number; comments?: number; shares?: number; saves?: number
  }

  const { data: post } = await supabaseAdmin.from('social_posts').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id').eq('id', post.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updates: Record<string, number | null> = {}
  if (impressions !== undefined) updates.impressions = impressions
  if (likes !== undefined) updates.likes_count = likes
  if (comments !== undefined) updates.comments_count = comments
  if (shares !== undefined) updates.shares_count = shares
  if (saves !== undefined) updates.saves_count = saves

  try {
    const { data, error } = await supabaseAdmin.from('social_posts').update(updates).eq('id', params.id).select('id').single()
    if (error) {
      const safeUpdates: Record<string, number | null> = {}
      if (likes !== undefined) safeUpdates.likes_count = likes
      if (comments !== undefined) safeUpdates.comments_count = comments
      const { data: d2 } = await supabaseAdmin.from('social_posts').update(safeUpdates).eq('id', params.id).select('id').single()
      return NextResponse.json({ ok: true, post: d2 })
    }
    return NextResponse.json({ ok: true, post: data })
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export const PATCH = withErrorCapture('social/posts/metrics', _PATCH)
