export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ alerts: [] }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ alerts: [] })
  const { data } = await supabaseAdmin.from('aria_condition_alerts')
    .select('*').eq('business_id', bid).order('created_at', { ascending: false })
  return NextResponse.json({ alerts: data ?? [] })
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as {
    name?: string; condition_type?: string; condition_config?: Record<string,unknown>; recipients?: string[]
  }
  if (!body.name?.trim() || !body.condition_type) {
    return NextResponse.json({ error: 'name and condition_type required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('aria_condition_alerts').insert({
    business_id: bid,
    name: body.name.trim(),
    condition_type: body.condition_type,
    condition_config: body.condition_config ?? {},
    recipients: (body.recipients ?? []).filter(Boolean),
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alert: data })
}

async function _PATCH(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as { id?: string; is_active?: boolean }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('aria_condition_alerts').update({ is_active: body.is_active }).eq('id', body.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/intelligence/alerts:GET', _GET)
export const POST = withBusinessContext('aria/intelligence/alerts:POST', _POST)
export const PATCH = withBusinessContext('aria/intelligence/alerts:PATCH', _PATCH)
