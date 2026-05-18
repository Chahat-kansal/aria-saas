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

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ watches: [] }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ watches: [] })
  const { data } = await supabaseAdmin.from('aria_competitor_watches')
    .select('*').eq('business_id', bid).order('created_at', { ascending: false })
  return NextResponse.json({ watches: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { competitor_name?: string; competitor_url?: string; products_to_watch?: string[] }
  if (!body.competitor_name?.trim()) return NextResponse.json({ error: 'competitor_name required' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('aria_competitor_watches').insert({
    business_id: bid,
    competitor_name: body.competitor_name.trim(),
    competitor_url: body.competitor_url?.trim() || null,
    products_to_watch: Array.isArray(body.products_to_watch) ? body.products_to_watch : [],
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ watch: data })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { id?: string; is_active?: boolean; products_to_watch?: string[] }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.is_active !== undefined) update.is_active = body.is_active
  if (body.products_to_watch !== undefined) update.products_to_watch = body.products_to_watch

  await supabaseAdmin.from('aria_competitor_watches').update(update).eq('id', body.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/intelligence/watches:GET', _GET)
export const POST = withErrorCapture('aria/intelligence/watches:POST', _POST)
export const PATCH = withErrorCapture('aria/intelligence/watches:PATCH', _PATCH)
