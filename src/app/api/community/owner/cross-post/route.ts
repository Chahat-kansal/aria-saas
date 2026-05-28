export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { crossPost, type ChannelKey } from '@/lib/community/cross-post'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    title?: string | null
    body?: string
    hashtags?: string[]
    media_urls?: string[]
    media_type?: 'image' | 'video' | 'reel' | null
    post_type?: string
    is_story?: boolean
    channels?: ChannelKey[]
    /** Optional — mark this cross-post as fulfilling a marketing draft */
    draft_id?: string
  }
  if (!body.body && !body.title) return NextResponse.json({ error: 'A title or body is required.' }, { status: 400 })
  if (!body.channels || body.channels.length === 0) return NextResponse.json({ error: 'Pick at least one channel.' }, { status: 400 })

  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') ?? ''

  const { results, any_ok } = await crossPost(
    supabase,
    user.id,
    {
      business_id: bid,
      post_type: body.post_type ?? 'update',
      title: body.title ?? null,
      body: body.body ?? '',
      hashtags: body.hashtags ?? [],
      media_urls: body.media_urls ?? [],
      media_type: body.media_type ?? null,
      is_story: !!body.is_story,
    },
    body.channels,
    { reqOrigin: origin, cookieHeader: cookie },
  )

  // If this cross-post belongs to a marketing draft, mark it as posted
  if (body.draft_id && any_ok) {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const communityResult = results.find(r => r.channel === 'community' && r.ok)
    const socialIds = results.filter(r => r.channel !== 'community' && r.ok).map(r => ({ channel: r.channel, id: r.id }))
    await supabaseAdmin.from('aria_marketing_drafts').update({
      status: 'posted',
      community_post_id: communityResult?.id ?? null,
      social_post_ids: socialIds,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', body.draft_id).eq('business_id', bid)
  }

  return NextResponse.json({ results, any_ok })
}

export const POST = withErrorCapture('community/owner/cross-post', _POST)
