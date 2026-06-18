export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// Outbound-link safety — strip whitespace, require https, reject junk.
function normaliseWebsite(raw: string): { url?: string; error?: string } {
  let v = (raw ?? '').toString().trim()
  if (!v) return { url: undefined } // empty = clear
  if (/^javascript:/i.test(v) || /^data:/i.test(v) || /^vbscript:/i.test(v)) return { error: 'That link type is not allowed.' }
  if (v.length < 4) return { error: 'That URL is too short.' }
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v
  // Force https for safety
  v = v.replace(/^http:\/\//i, 'https://')
  try {
    const u = new URL(v)
    // host must contain a dot and a TLD-ish suffix
    if (!u.hostname.includes('.') || u.hostname.length < 4) return { error: 'That doesn\'t look like a valid website.' }
    return { url: u.href }
  } catch {
    return { error: 'That doesn\'t look like a valid website.' }
  }
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data } = await supabaseAdmin.from('businesses')
    .select('id, name, website, community_bio, community_cover_url, community_verified, logo_url, industry, suburb, city, phone, address')
    .eq('id', bid).maybeSingle()
  return NextResponse.json({ profile: data })
}

async function _PUT(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { website?: string | null; community_bio?: string }
  const patch: Record<string, unknown> = {}

  if (body.website !== undefined) {
    if (body.website === null || body.website === '') {
      patch.website = null
    } else {
      const { url, error } = normaliseWebsite(body.website)
      if (error) return NextResponse.json({ error }, { status: 400 })
      patch.website = url ?? null
    }
  }
  if (body.community_bio !== undefined) patch.community_bio = body.community_bio.toString().slice(0, 280) || null

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 })

  const { error } = await supabaseAdmin.from('businesses').update(patch).eq('id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, website: patch.website })
}

export const GET = withErrorCapture('community/owner/profile', _GET)
export const PUT = withErrorCapture('community/owner/profile', _PUT)
