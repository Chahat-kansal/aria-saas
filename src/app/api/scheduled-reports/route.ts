export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function computeNextSend(freq: string, dayOfWeek: number | null, dayOfMonth: number | null, hourAest: number): Date {
  const now = new Date()
  const hourUtc = (hourAest - 10 + 24) % 24

  if (freq === 'daily') {
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }
  if (freq === 'weekly' && dayOfWeek !== null) {
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7 || 7
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next
  }
  if (freq === 'monthly' && dayOfMonth !== null) {
    const next = new Date(now)
    next.setUTCDate(Math.min(dayOfMonth, 28))
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1)
    return next
  }
  return now
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const business_id = url.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: reports } = await supabaseAdmin
    .from('scheduled_pdf_reports')
    .select('id, label, frequency, day_of_week, day_of_month, hour_aest, recipients, pages_allowed, include_share_link, is_active, next_send_at, last_sent_at, created_at')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ reports: reports ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    business_id?: string
    label?: string
    frequency?: string
    day_of_week?: number | null
    day_of_month?: number | null
    hour_aest?: number
    recipients?: { name: string; email: string }[]
    pages_allowed?: string[]
    include_share_link?: boolean
  }

  const { business_id, label, frequency, recipients } = body
  if (!business_id || !label || !frequency || !recipients?.length) {
    return NextResponse.json({ error: 'business_id, label, frequency, and recipients required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const hourAest = body.hour_aest ?? 8
  const dayOfWeek = body.day_of_week ?? null
  const dayOfMonth = body.day_of_month ?? null
  const next_send_at = computeNextSend(frequency, dayOfWeek, dayOfMonth, hourAest)

  const { data: report, error: insertErr } = await supabaseAdmin
    .from('scheduled_pdf_reports')
    .insert({
      business_id, label, frequency,
      day_of_week: dayOfWeek, day_of_month: dayOfMonth,
      hour_aest: hourAest,
      recipients: body.recipients,
      pages_allowed: body.pages_allowed ?? [],
      include_share_link: body.include_share_link ?? true,
      is_active: true,
      next_send_at: next_send_at.toISOString(),
    })
    .select('id, next_send_at').single()

  if (insertErr || !report) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to create report' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: report.id, next_send_at: report.next_send_at })
}

export const GET = withErrorCapture('scheduled-reports', _GET)
export const POST = withErrorCapture('scheduled-reports', _POST)
