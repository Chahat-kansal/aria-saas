export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { crossPost, type ChannelKey } from '@/lib/community/cross-post'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// POST — bulk-publish every approved draft (optionally limited to one plan_run_id)
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { plan_run_id?: string; ids?: string[] }

  let q = supabaseAdmin.from('aria_marketing_drafts')
    .select('id, post_type, draft_title, draft_body, draft_hashtags, channels')
    .eq('business_id', bid).eq('status', 'approved')
  if (body.plan_run_id) q = q.eq('plan_run_id', body.plan_run_id)
  if (Array.isArray(body.ids) && body.ids.length > 0) q = q.in('id', body.ids)

  const { data: drafts } = await q
  type Row = { id: string; post_type: string; draft_title: string | null; draft_body: string; draft_hashtags: string[]; channels: string[] }
  const list = (drafts ?? []) as Row[]
  if (list.length === 0) return NextResponse.json({ posted: 0, results: [] })

  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') ?? ''
  type AggregatedResult = { draft_id: string; channels: Array<{ channel: ChannelKey; ok: boolean; error?: string; id?: string | null; label: string }> }
  const out: AggregatedResult[] = []

  for (const d of list) {
    const channels = (d.channels ?? ['community']).filter((c): c is ChannelKey => ['community', 'instagram', 'facebook', 'google_business'].includes(c))
    const { results, any_ok } = await crossPost(
      supabase, user.id,
      {
        business_id: bid,
        post_type: d.post_type,
        title: d.draft_title,
        body: d.draft_body,
        hashtags: d.draft_hashtags ?? [],
        is_story: d.post_type === 'story',
      },
      channels,
      { reqOrigin: origin, cookieHeader: cookie },
    )

    if (any_ok) {
      const communityResult = results.find(r => r.channel === 'community' && r.ok)
      await supabaseAdmin.from('aria_marketing_drafts').update({
        status: 'posted',
        community_post_id: communityResult?.id ?? null,
        social_post_ids: results.filter(r => r.channel !== 'community' && r.ok).map(r => ({ channel: r.channel, id: r.id })),
        posted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', d.id).eq('business_id', bid)
    }
    out.push({ draft_id: d.id, channels: results })
  }

  return NextResponse.json({ posted: out.length, results: out })
}

export const POST = withErrorCapture('community/owner/marketer/post-all', _POST)
