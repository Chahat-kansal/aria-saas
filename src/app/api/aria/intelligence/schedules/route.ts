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
  if (!user) return NextResponse.json({ schedules: [] }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ schedules: [] })
  const { data } = await supabaseAdmin.from('aria_scheduled_reports')
    .select('*').eq('business_id', bid).order('created_at', { ascending: false })
  return NextResponse.json({ schedules: data ?? [] })
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as {
    name?: string; report_type?: string; send_at_hour?: number
    send_on_days?: number[]; recipients?: string[]
  }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const recipients = (body.recipients ?? []).filter(Boolean)
  if (recipients.length === 0) return NextResponse.json({ error: 'At least one recipient required' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('aria_scheduled_reports').insert({
    business_id: bid,
    name: body.name.trim(),
    report_type: body.report_type ?? 'daily_summary',
    send_at_hour: Number(body.send_at_hour) || 18,
    send_on_days: Array.isArray(body.send_on_days) ? body.send_on_days : [1,2,3,4,5,6,7],
    recipients,
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: data })
}

async function _PATCH(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as { id?: string; is_active?: boolean }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('aria_scheduled_reports').update({ is_active: body.is_active }).eq('id', body.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/intelligence/schedules:GET', _GET)
export const POST = withBusinessContext('aria/intelligence/schedules:POST', _POST)
export const PATCH = withBusinessContext('aria/intelligence/schedules:PATCH', _PATCH)
