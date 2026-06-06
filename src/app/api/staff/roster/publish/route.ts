export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { summariseRoster } from '@/lib/staff/roster'
import type { ShiftEntry } from '@/lib/staff/roster'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function sendShiftSMS(to: string, message: string): Promise<boolean> {
  const result = await sendSMS(to, message)
  return result.ok
}

async function sendShiftEmail(to: string, staffName: string, bizName: string, weekStart: string, shifts: ShiftEntry[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY ?? ''
  if (!apiKey) return false
  const shiftLines = [...shifts].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map(s => {
      const date = new Date(s.start_time).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })
      return `<li>${date}: ${s.start_time.slice(11, 16)}–${s.end_time.slice(11, 16)}${s.role ? ` (${s.role})` : ''}${s.area_name ? ` @ ${s.area_name}` : ''}</li>`
    }).join('')
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;"><h2 style="color:#2D5240;">Hi ${staffName},</h2><p>Your roster for <strong>${weekStart}</strong> has been published by ${bizName}.</p><ul style="line-height:2;">${shiftLines}</ul><p style="color:#666;font-size:13px;">Contact your manager for any questions.</p></div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Aria OS <aria@ariaos.site>', to: [to], subject: `Your roster for ${weekStart} — ${bizName}`, html }),
  })
  return r.ok
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { week_start?: string; shifts?: ShiftEntry[] }
  const weekStart = String(body.week_start ?? '')
  const shifts = Array.isArray(body.shifts) ? body.shifts as ShiftEntry[] : []
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('name').eq('id', bid).maybeSingle()
  const bizName = (biz as { name?: string } | null)?.name ?? 'Your employer'
  const summary = summariseRoster(shifts)

  const rosterData = {
    business_id: bid, week_start: weekStart, shifts,
    total_hours: summary.total_hours, total_cost_cents: summary.total_cost_cents,
    published: true, published_at: new Date().toISOString(), status: 'published',
    updated_at: new Date().toISOString(),
  }
  const { data: existing } = await supabase.from('pos_rosters').select('id').eq('business_id', bid).eq('week_start', weekStart).maybeSingle()
  if (existing) {
    await supabase.from('pos_rosters').update(rosterData).eq('id', String(existing.id))
  } else {
    await supabase.from('pos_rosters').insert(rosterData)
  }

  const shiftsByStaff = new Map<string, ShiftEntry[]>()
  for (const s of shifts) {
    if (!shiftsByStaff.has(s.staff_member_id)) shiftsByStaff.set(s.staff_member_id, [])
    shiftsByStaff.get(s.staff_member_id)!.push(s)
  }

  const staffIds = [...shiftsByStaff.keys()]
  const { data: staffList } = staffIds.length > 0
    ? await supabase.from('staff_members').select('id,first_name,preferred_name,mobile,personal_email,work_email').in('id', staffIds).eq('business_id', bid)
    : { data: [] }

  let notified = 0
  for (const sm of staffList ?? []) {
    const staffShifts = shiftsByStaff.get(String(sm.id)) ?? []
    if (!staffShifts.length) continue
    const name = String((sm as Record<string,unknown>).preferred_name ?? (sm as Record<string,unknown>).first_name ?? '')

    const mobile = (sm as Record<string,unknown>).mobile as string | null
    if (mobile) {
      const shiftText = [...staffShifts].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .map(s => {
          const d = new Date(s.start_time).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
          return `${d} ${s.start_time.slice(11, 16)}-${s.end_time.slice(11, 16)}`
        }).join(', ')
      await sendShiftSMS(mobile, `Hi ${name}! ${bizName} roster w/c ${weekStart}: ${shiftText}.`.slice(0, 160))
    }

    const email = String((sm as Record<string,unknown>).work_email ?? (sm as Record<string,unknown>).personal_email ?? '')
    if (email) {
      await sendShiftEmail(email, name, bizName, weekStart, staffShifts)
      notified++
    }
  }

  try {
    await supabaseAdmin.from('aria_actions').insert({
      business_id: bid, category: 'staff',
      title: `Roster published: week of ${weekStart}`,
      recommendation: `${shifts.length} shifts, ${notified} staff notified. Cost: $${(summary.total_cost_cents / 100).toFixed(2)}`,
      expected_impact: (summary.total_cost_cents / 100).toFixed(2),
      confidence: 'high', status: 'completed', source: 'roster:publish', priority: 'medium',
      payload: { week_start: weekStart, shift_count: shifts.length, notified },
    })
  } catch (e) { console.error('[non-fatal]', e) }

  return NextResponse.json({ ok: true, notified, summary })
}

export const POST = withErrorCapture('staff/roster/publish', _POST)
