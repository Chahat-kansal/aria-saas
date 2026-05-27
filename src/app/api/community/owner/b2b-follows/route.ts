export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// GET — the businesses this owner's active business is following (B2B network)
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data } = await supabaseAdmin.from('community_business_follows')
    .select('id, following_business_id, followed_at, businesses!community_business_follows_following_business_id_fkey(name, logo_url, industry, city, suburb, community_verified)')
    .eq('follower_business_id', bid)
    .order('followed_at', { ascending: false })
  return NextResponse.json({ follows: data ?? [], business_id: bid })
}

// POST — follow another business
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { following_business_id?: string }
  if (!body.following_business_id) return NextResponse.json({ error: 'following_business_id required' }, { status: 400 })
  if (body.following_business_id === bid) return NextResponse.json({ error: 'A business cannot follow itself.' }, { status: 400 })

  // Verify the target exists
  const { data: target } = await supabaseAdmin.from('businesses').select('id').eq('id', body.following_business_id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'Business not found.' }, { status: 404 })

  const { error } = await supabaseAdmin.from('community_business_follows').upsert({
    follower_business_id: bid,
    following_business_id: body.following_business_id,
  }, { onConflict: 'follower_business_id,following_business_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — unfollow
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const following_business_id = searchParams.get('following_business_id')
  if (!following_business_id) return NextResponse.json({ error: 'following_business_id required' }, { status: 400 })

  await supabaseAdmin.from('community_business_follows')
    .delete()
    .eq('follower_business_id', bid)
    .eq('following_business_id', following_business_id)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('community/owner/b2b-follows', _GET)
export const POST   = withErrorCapture('community/owner/b2b-follows', _POST)
export const DELETE = withErrorCapture('community/owner/b2b-follows', _DELETE)
