export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computeHours } from '@/lib/staff/timesheets'
import { getBid } from '@/lib/auth/get-bid'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: existing } = await supabase.from('pos_timesheets')
    .select('*').eq('id', params.id).eq('business_id', bid).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.approved) return NextResponse.json({ error: 'Cannot edit an approved timesheet' }, { status: 409 })

  const body = await req.json().catch(() => ({})) as {
    clock_in?: string; clock_out?: string; break_minutes?: number; notes?: string; approved?: boolean
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.clock_in) update.clock_in = body.clock_in
  if (body.clock_out) update.clock_out = body.clock_out
  if (body.break_minutes !== undefined) update.break_minutes = Number(body.break_minutes) || 0
  if (body.notes !== undefined) update.notes = body.notes ?? null

  const clockIn = String(update.clock_in ?? existing.clock_in)
  const clockOut = String(update.clock_out ?? existing.clock_out ?? '')
  if (clockOut) {
    const hours = computeHours(clockIn, clockOut, Number(update.break_minutes ?? existing.break_minutes) || 0)
    update.total_pay_cents = Math.round(hours * (Number(existing.pay_rate_cents) || 0))
    update.status = 'pending'
  }

  if (body.approved === true) {
    update.approved = true
    update.approved_by = user.id
    update.approved_at = new Date().toISOString()
    update.status = 'approved'
  }

  const { data, error } = await supabase.from('pos_timesheets')
    .update(update).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ timesheet: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { supabaseAdmin } = await import('@/lib/supabase-admin')
  await supabaseAdmin.from('pos_timesheets').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('staff/timesheets/[id]', _PATCH)
export const DELETE = withErrorCapture('staff/timesheets/[id]', _DELETE)
