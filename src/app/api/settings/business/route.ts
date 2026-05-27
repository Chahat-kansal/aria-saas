export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ business: null })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, industry, abn, city, address, phone, google_place_id, google_average_rating, google_total_reviews, google_reviews_last_synced, facebook_page_id, yelp_url, auto_review_requests, google_review_link')
    .eq('id', bid)
    .maybeSingle()

  return NextResponse.json({ business: biz ?? null })
}

export const GET = withErrorCapture('settings/business', _GET)

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const payload: Record<string, unknown> = {}
  if (body.name       !== undefined) payload.name        = body.name
  if (body.abn        !== undefined) payload.abn         = body.abn
  if (body.city       !== undefined) payload.city        = body.city
  if (body.address    !== undefined) payload.address     = body.address
  if (body.phone      !== undefined) payload.phone       = body.phone
  if (body.industry   !== undefined) payload.industry    = body.industry
  if (body.google_place_id     !== undefined) payload.google_place_id     = body.google_place_id || null
  if (body.facebook_page_id    !== undefined) payload.facebook_page_id    = body.facebook_page_id || null
  if (body.yelp_url            !== undefined) payload.yelp_url            = body.yelp_url || null
  if (body.auto_review_requests !== undefined) payload.auto_review_requests = !!body.auto_review_requests
  if (body.google_review_link  !== undefined) payload.google_review_link  = body.google_review_link || null

  if (Object.keys(payload).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin.from('businesses').update(payload).eq('id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('settings/business', _PATCH)