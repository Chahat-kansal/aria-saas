export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveOwnerBusinessId as getBid } from '@/lib/community/resolveOwnerBusinessId'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// CX-OWNER-TRUST-2 — owner management of story highlights shown on the public community profile.


async function resolveOwner(): Promise<{ bid: string } | { error: NextResponse }> {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const bid = await getBid(supabase, user.id)
  if (!bid) return { error: NextResponse.json({ error: 'No business' }, { status: 400 }) }
  return { bid }
}

async function _GET() {
  const r = await resolveOwner()
  if ('error' in r) return r.error
  const { data } = await supabaseAdmin.from('community_story_highlights')
    .select('id, title, cover_url, post_ids, display_order, created_at')
    .eq('business_id', r.bid)
    .order('display_order', { ascending: true }).order('created_at', { ascending: true })
  return NextResponse.json({ highlights: data ?? [] })
}

async function _POST(req: Request) {
  const r = await resolveOwner()
  if ('error' in r) return r.error
  const body = await req.json().catch(() => ({})) as { title?: string; post_ids?: string[]; cover_url?: string; use_latest_story?: boolean }
  const title = (body.title ?? '').toString().trim().slice(0, 32)
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 })

  let postIds = Array.isArray(body.post_ids) ? body.post_ids.filter(x => typeof x === 'string').slice(0, 20) : []
  let coverUrl = body.cover_url ?? null

  // "use latest story" (or no posts supplied) → auto-pick the most recent story post for this business.
  if (postIds.length === 0 || body.use_latest_story) {
    const { data: latest } = await supabaseAdmin.from('community_posts')
      .select('id, media_urls')
      .eq('business_id', r.bid).eq('is_story', true)
      .order('published_at', { ascending: false }).limit(1).maybeSingle()
    if (latest) {
      postIds = [latest.id as string]
      if (!coverUrl) coverUrl = Array.isArray(latest.media_urls) ? ((latest.media_urls as string[])[0] ?? null) : null
    }
  }

  // Append after existing highlights.
  const { data: last } = await supabaseAdmin.from('community_story_highlights')
    .select('display_order').eq('business_id', r.bid).order('display_order', { ascending: false }).limit(1).maybeSingle()
  const displayOrder = ((last?.display_order as number) ?? -1) + 1

  const { data, error } = await supabaseAdmin.from('community_story_highlights')
    .insert({ business_id: r.bid, title, cover_url: coverUrl, post_ids: postIds, display_order: displayOrder })
    .select('id, title, cover_url, post_ids, display_order, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ highlight: data }, { status: 201 })
}

async function _DELETE(req: Request) {
  const r = await resolveOwner()
  if ('error' in r) return r.error
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Scoped to the owner's business — cannot delete another business's highlight.
  await supabaseAdmin.from('community_story_highlights').delete().eq('id', id).eq('business_id', r.bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('community/owner/highlights:get', _GET)
export const POST = withErrorCapture('community/owner/highlights:post', _POST)
export const DELETE = withErrorCapture('community/owner/highlights:delete', _DELETE)
