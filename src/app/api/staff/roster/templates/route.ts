export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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
  if (!user) return NextResponse.json({ templates: [] }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ templates: [] })
  const { data } = await supabase.from('pos_roster_templates')
    .select('id,name,week_starting,total_hours,total_cost_cents,status,created_at')
    .eq('business_id', bid).order('created_at', { ascending: false }).limit(20)
  return NextResponse.json({ templates: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { name?: string; shifts?: unknown; week_start?: string; total_hours?: number; total_cost_cents?: number }
  const { data, error } = await supabase.from('pos_roster_templates').insert({
    business_id: bid,
    name: String(body.name ?? 'Roster template').slice(0, 100),
    week_starting: String(body.week_start ?? new Date().toISOString().slice(0, 10)),
    shifts: body.shifts ?? [],
    total_hours: Number(body.total_hours) || 0,
    total_cost_cents: Number(body.total_cost_cents) || 0,
    status: 'draft',
  }).select('id,name').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}

export const GET = withErrorCapture('staff/roster/templates', _GET)
export const POST = withErrorCapture('staff/roster/templates', _POST)
