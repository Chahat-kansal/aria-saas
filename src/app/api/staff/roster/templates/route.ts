export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ templates: [] }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ templates: [] })
  const { data } = await supabaseAdmin.from('pos_roster_templates')
    .select('id,name,week_starting,shifts,total_hours,total_cost_cents,status,created_at')
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
  const { data, error } = await supabaseAdmin.from('pos_roster_templates').insert({
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

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('pos_roster_templates').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('staff/roster/templates', _GET)
export const POST = withErrorCapture('staff/roster/templates', _POST)
export const DELETE = withErrorCapture('staff/roster/templates', _DELETE)
